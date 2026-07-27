/**
 * Observability wiring for the Expo example — runs once at module load.
 *
 * Extracted from `App.tsx` so multiple screens (Home / Network / Logs / Errors)
 * can share one logger + HTTP observer + mock engine. The key addition for the
 * multi-screen example is `createScreenProvider()` (Track 5, T5-1): wiring it
 * into both the logger and the HTTP observer tags every log + network entry with
 * the screen that was active when it fired, so the panel's per-screen filter has
 * real data once `observeReactNavigation` is feeding the screen store.
 */

import axios from 'axios';
import {
  createLogger,
  ConsoleTransport,
  MemoryTransport,
  LogLevel,
  ObservabilityConfig,
  FeatureFlagManager,
  createHttpObserver,
  createMockEngine,
  createCustomAdapter,
  createScreenProvider,
  installGlobalErrorHandler,
  installConsoleProxy,
  BreadcrumbTransport,
  getBreadcrumbStore,
  type LogEntry,
} from 'react-native-observability';
import {
  MMKVTransport,
  initSessionManager,
  getCurrentSessionId,
  getSessions,
  type MMKVLike,
} from 'react-native-observability/storage';
// A STATIC import so Metro bundles react-native-mmkv into the app. (The library's
// createStorage() loads it via a dynamic require inside its pre-built dist chunk,
// which Metro can't statically discover — so the app must reference mmkv itself.
// This is also the real-world pattern: you own the MMKV instance, Observability's
// MMKVTransport just persists into it.) The import is side-effect-light; in Expo
// Go the native module simply isn't present and the try/catch below falls back.
import { createMMKV } from 'react-native-mmkv';
import { observeAxios } from 'react-native-observability/observers/axios';
import { observeFetch } from 'react-native-observability/observers/fetch';

export const memoryTransport = new MemoryTransport({ maxEntries: 200 });

// ─── Optional MMKV persistence (Expo dev build only) ────────────────────────
//
// react-native-mmkv is a native module: it works in an **Expo dev build**
// (`npx expo run:ios` / EAS) but NOT in Expo Go. `createStorage()` throws when
// the native module is unavailable, so we wire it behind a try/catch and fall
// back to in-memory behaviour. When present, this unlocks the full persistence
// story: logs survive restarts (MMKVTransport), sessions are correlated and
// crash-detected across launches (SessionManager), panel prefs persist, and the
// breadcrumb crash-trail is recoverable on next launch.
let mmkvStorage: MMKVLike | null = null;
let mmkvTransport: MMKVTransport | null = null;
try {
  // createMMKV() (mmkv v4 Nitro factory) touches the native module — it throws in
  // Expo Go where that module isn't present, so we catch and fall back to memory.
  const raw = createMMKV({ id: 'observability-expo-example' });
  // mmkv v4 renamed `delete(key)` → `remove(key)`. Adapt the raw instance to the
  // stable MMKVLike surface Observability's MMKVTransport expects (it calls .delete).
  mmkvStorage = {
    set: (k, v) => raw.set(k, v),
    getString: k => raw.getString(k),
    getNumber: k => raw.getNumber(k),
    getBoolean: k => raw.getBoolean(k),
    contains: k => raw.contains(k),
    getAllKeys: () => raw.getAllKeys(),
    delete: k => raw.remove(k),
  };
  mmkvTransport = new MMKVTransport({ storage: mmkvStorage, minLevel: LogLevel.WARN });
} catch {
  // Expo Go (or any environment without the native module) — stay in-memory.
  mmkvStorage = null;
  mmkvTransport = null;
}

/** True in an Expo dev build where MMKV is wired; false in Expo Go. */
export const isPersistent = mmkvStorage !== null;

// A custom adapter is pure JS, so it works in Expo Go — here it just collects
// captured errors in memory (a real adapter would forward to Sentry/Datadog).
export const capturedErrors: { message: string }[] = [];
const demoAdapter = createCustomAdapter({
  name: 'demo',
  minLevel: LogLevel.ERROR,
  captureException: err => capturedErrors.push({ message: err.message }),
});

// Resolves the currently-active screen from the shared screen store. Wired into
// both the logger and the HTTP observer below so entries are tagged with the
// screen that was active when they fired. The store is populated by
// `observeReactNavigation` (see App.tsx).
// A generous idle window for the demo (default is 1000ms): the example fires
// most requests/logs by tapping a button well after a screen settles, so a
// short window would leave them untagged. 30s keeps button-fired activity
// attributed to the visible screen so the panel's per-screen filters are
// populated. Real apps usually want the tighter default.
const screenProvider = createScreenProvider({ idleMs: 30_000 });

export const logger = createLogger({
  namespace: 'example',
  level: LogLevel.DEBUG,
  // ConsoleTransport + MemoryTransport always; BreadcrumbTransport records every
  // log (incl. navigation) into the timeline (Settings → Timeline, T5-6); the
  // MMKVTransport is appended only in a dev build so WARN+ logs persist across
  // restarts (filtered out via Boolean() in Expo Go).
  transports: [
    new ConsoleTransport(),
    memoryTransport,
    new BreadcrumbTransport(),
    ...(mmkvTransport !== null ? [mmkvTransport] : []),
  ],
  adapters: [demoAdapter],
  // Deep + default-on PII redaction; add app-specific keys too.
  redact: { keys: ['password', 'token'] },
  // Tag every log entry with the active screen → panel Logs SCREEN filter.
  screenProvider,
  // In a dev build, stamp every entry with the active session id so persisted
  // logs are correlated to the session/run that produced them.
  ...(isPersistent ? { sessionIdProvider: getCurrentSessionId } : {}),
});

// Init the session manager once MMKV is available: it creates a session row,
// marks a prior session without an endTime as `crashed` (surfaced in the panel's
// session selector + the breadcrumb crash trail), and wires the session id into
// the MMKV transport so persisted logs carry it.
if (mmkvStorage !== null && mmkvTransport !== null) {
  initSessionManager(mmkvStorage, {
    appVersion: '0.3.0',
    buildNumber: 1,
    transports: [mmkvTransport],
  });
}

ObservabilityConfig.init({
  app: {
    name: 'Observability Example',
    version: '0.2.0',
    buildNumber: 1,
    buildType: 'development',
  },
  logger: { namespace: 'example', level: LogLevel.DEBUG, transports: [] },
});

// Capture uncaught JS errors + unhandled promise rejections into the logger.
installGlobalErrorHandler(logger);

// Route any stray console.* through the logger too (migration on-ramp).
installConsoleProxy(logger);

export const http = createHttpObserver({
  logger,
  redact: { headerKeys: ['Authorization'], bodyKeys: ['password', 'token'] },
  // Tag every network entry with the active screen → panel Network SCREEN filter.
  screenProvider,
  // Record completed requests into the breadcrumb timeline (Settings → Timeline).
  breadcrumbs: getBreadcrumbStore(),
});

// Network mock engine — dev-only by default. Seeded with demo rules across all
// action types (disabled); enable + edit them live from Network → Rules.
export const mockEngine = createMockEngine({
  rules: [
    // respond — answer without hitting the network.
    {
      id: 'mock-todo-1',
      enabled: false,
      match: { url: '/todos/1' },
      action: { type: 'respond', status: 200, body: { id: 1, title: 'Mocked todo', done: true } },
    },
    // block — fail matching requests.
    {
      id: 'block-analytics',
      enabled: false,
      match: { url: '**/analytics/**' },
      action: { type: 'block' },
    },
    // modifyRequest — inject a header + rewrite the body before sending.
    {
      id: 'tag-posts',
      enabled: false,
      match: { method: 'POST', url: '/posts' },
      action: { type: 'modifyRequest', headers: { set: { 'X-Observability-Mock': '1' } } },
    },
    // modifyResponse — force a real GET /posts/1 to look like a 503.
    {
      id: 'force-503',
      enabled: false,
      match: { url: '/posts/1' },
      action: { type: 'modifyResponse', status: 503, body: { error: 'forced by mock' } },
    },
    // fault — make every 3rd /users call fail, to exercise retry logic.
    {
      id: 'flaky-users',
      enabled: false,
      match: { url: '/users' },
      action: { type: 'fault', kind: 'networkError', everyN: 3 },
    },
  ],
});

export const apiClient = axios.create({ baseURL: 'https://jsonplaceholder.typicode.com' });
observeAxios(apiClient, http, { mock: mockEngine });
observeFetch(http, { mock: mockEngine });

// ─── Screen-attribution demo helpers (Option D) ────────────────────────────
//
// These feed the HTTP observer directly with an explicit `screen` override,
// exactly as a real global interceptor (or a background task) would. They issue
// a real fetch and report a paired start/end so the request shows in the panel.

let demoReqSeq = 0;

/**
 * A request NOT attributable to the visible screen — e.g. a global axios
 * interceptor refreshing a JWT. Passing `screen: null` forces "no screen" so it
 * is NOT mis-tagged with whatever tab is open. (Case 2.)
 */
export async function globalApiCall(path: string): Promise<void> {
  const id = `global-${demoReqSeq++}`;
  const url = `https://jsonplaceholder.typicode.com${path}`;
  http.onStart({ id, ts: Date.now(), method: 'GET', url, source: 'fetch', screen: null });
  const startedAt = Date.now();
  try {
    const res = await fetch(url);
    http.onEnd({ id, durationMs: Date.now() - startedAt, status: res.status });
    logger.info('Global JWT refresh (screen-agnostic)', { screen: null });
  } catch (err) {
    http.onEnd({
      id,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

/**
 * A request that belongs to a specific screen even though another screen may be
 * visible — e.g. Screen A is still in the stack and fires a background poll.
 * Passing an explicit `screen` attributes it to A regardless of the active tab.
 * (Case 3.)
 */
export async function taggedApiCall(path: string, screen: string): Promise<void> {
  const id = `tagged-${demoReqSeq++}`;
  const url = `https://jsonplaceholder.typicode.com${path}`;
  http.onStart({ id, ts: Date.now(), method: 'GET', url, source: 'fetch', screen });
  const startedAt = Date.now();
  try {
    const res = await fetch(url);
    http.onEnd({ id, durationMs: Date.now() - startedAt, status: res.status });
    logger.info(`Background poll attributed to ${screen}`, { screen });
  } catch (err) {
    http.onEnd({
      id,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// Seed demo feature flags so the State tab's Flags view has something to show.
FeatureFlagManager.init({ new_checkout_ui: false, dark_mode: true });

// Panel preference persistence. PanelPersistence is just { getItem, setItem }.
// In a dev build we back it with the same MMKV instance the logger uses, so panel
// filters/theme survive restarts; in Expo Go it falls back to an in-memory Map.
const prefsMemory = new Map<string, string>();
export const panelPersist =
  mmkvStorage !== null
    ? {
        getItem: (key: string) => mmkvStorage!.getString(key) ?? null,
        setItem: (key: string, value: string) => mmkvStorage!.set(key, value),
      }
    : {
        getItem: (key: string) => prefsMemory.get(key) ?? null,
        setItem: (key: string, value: string) => void prefsMemory.set(key, value),
      };

// Breadcrumb crash trail (T5-6): wire MMKV persistence keyed per session so a
// crashed run's breadcrumbs replay on next launch (Settings → Timeline). In Expo
// Go the timeline is live-only (no cross-launch trail).
if (mmkvStorage !== null && isPersistent) {
  const sessionId = getCurrentSessionId();
  if (sessionId !== undefined) {
    getBreadcrumbStore().configurePersistence(
      {
        getItem: key => mmkvStorage!.getString(key) ?? null,
        setItem: (key, value) => mmkvStorage!.set(key, value),
        removeItem: key => mmkvStorage!.delete(key),
      },
      sessionId
    );
  }
}

/** Snapshot of the persistence/session state for the Home screen's Storage card. */
export interface SessionInfo {
  /** True in a dev build with MMKV wired; false in Expo Go. */
  persistent: boolean;
  /** Current session id (short form), or undefined in Expo Go. */
  sessionId: string | undefined;
  /** Total sessions retained in MMKV (0 in Expo Go). */
  sessionCount: number;
  /** Whether any prior session ended uncleanly (crash detected on this launch). */
  priorCrash: boolean;
}

/** Read the current persistence/session state. Safe in Expo Go (returns zeros). */
export function getSessionInfo(): SessionInfo {
  if (!isPersistent) {
    return { persistent: false, sessionId: undefined, sessionCount: 0, priorCrash: false };
  }
  const current = getCurrentSessionId();
  const sessions = getSessions();
  return {
    persistent: true,
    sessionId: current,
    sessionCount: sessions.length,
    priorCrash: sessions.some(s => s.sessionId !== current && s.crashed === true),
  };
}

/**
 * Wipe everything Observability persisted to MMKV — all sessions, persisted logs,
 * panel prefs, and breadcrumb trails. Returns the number of keys removed. A no-op
 * (returns 0) in Expo Go where there is no MMKV. The next launch starts clean.
 */
export function clearPersistentStorage(): number {
  if (mmkvStorage === null) return 0;
  const keys = mmkvStorage.getAllKeys();
  for (const k of keys) mmkvStorage.delete(k);
  logger.warn('Cleared all persisted MMKV storage', { keysRemoved: keys.length });
  return keys.length;
}

/**
 * Read a past session's persisted logs from MMKV — passed to the panel's
 * `getSessionLogs` prop so selecting a prior session in the header shows that
 * session's logs (read-only). Empty in Expo Go (no MMKV transport).
 */
export function getSessionLogs(sessionId: string): readonly LogEntry[] {
  return mmkvTransport?.getEntriesForSession(sessionId) ?? [];
}
