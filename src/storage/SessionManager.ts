import type { MMKVLike } from './createStorage';
import { deserialize, serialize } from './schema';
import type { SessionMeta } from './types';

const SESSIONS_KEY = 't:sessions';
const DEFAULT_MAX_SESSIONS = 3;

/**
 * Public interface for an MMKV transport that needs to be told the current
 * session id. Imported through this minimal shape to keep `SessionManager`
 * decoupled from the concrete `MMKVTransport` class.
 */
export interface SessionAwareTransport {
  setSessionId(sessionId: string): void;
}

/** Options for {@link initSessionManager}. */
export interface InitSessionManagerOptions {
  readonly appVersion: string;
  readonly buildNumber: string | number;
  /** Maximum sessions retained. Default: `3`. */
  readonly maxSessions?: number;
  /**
   * Transports that should be notified of the current session id (typically
   * an {@link MMKVTransport}). Each is called via `setSessionId(currentId)`
   * during init and any time the session rotates.
   */
  readonly transports?: readonly SessionAwareTransport[];
  /**
   * Listener for AppState transitions used to mark the current session as
   * cleanly ended. When omitted, the manager loads `AppState` from
   * `react-native` itself. Provide a stub in tests.
   */
  readonly appState?: AppStateLike;
}

/** Minimal `AppState` shape — only what the manager subscribes to. */
export interface AppStateLike {
  addEventListener(type: 'change', listener: (state: string) => void): { remove(): void };
}

/** Returned by {@link initSessionManager}; call to remove the AppState listener. */
export type EndSessionManagerFn = () => void;

// ─── Module-level state ───────────────────────────────────────────────────
// SessionManager is intentionally a singleton: `Logger.sessionIdProvider`
// resolves through `getCurrentSessionId()` and must read the same value
// regardless of where in the app it is called from.

let _mmkv: MMKVLike | null = null;
let _currentSessionId = '';

/** Returns the current session id, or `undefined` when the manager is not initialized. */
export function getCurrentSessionId(): string | undefined {
  return _currentSessionId === '' ? undefined : _currentSessionId;
}

/**
 * Returns all known session metadata, most recent first.
 * Empty array when the manager is not initialized or no sessions exist.
 */
export function getSessions(): SessionMeta[] {
  if (_mmkv === null) return [];
  return loadSessions(_mmkv);
}

/**
 * Manually mark the current session as ended. Called automatically when the
 * app backgrounds or goes inactive; exposed for explicit teardown (e.g. in
 * tests). Writing `endTime` is what distinguishes a clean exit from a crash on
 * the next launch.
 */
export function endCurrentSession(): void {
  if (_mmkv === null || _currentSessionId === '') return;
  const sessions = loadSessions(_mmkv);
  const current = sessions.find(s => s.sessionId === _currentSessionId);
  if (current && current.endTime === undefined) {
    current.endTime = Date.now();
    persistSessions(_mmkv, sessions);
  }
}

/**
 * Re-open the current session by clearing a previously written `endTime`.
 * Called automatically when AppState returns to `'active'` after an
 * `'inactive'`/`'background'` blip that did not actually terminate the app, so
 * a transient interruption (control center, an incoming-call overlay) does not
 * prematurely close a still-running session. No-op if the session was never
 * ended.
 */
export function reopenCurrentSession(): void {
  if (_mmkv === null || _currentSessionId === '') return;
  const sessions = loadSessions(_mmkv);
  const current = sessions.find(s => s.sessionId === _currentSessionId);
  if (current && current.endTime !== undefined) {
    delete current.endTime;
    persistSessions(_mmkv, sessions);
  }
}

/** @internal — test teardown only. */
export function _resetSessionManager(): void {
  _mmkv = null;
  _currentSessionId = '';
}

/**
 * Initialise session tracking.
 *
 * On every launch:
 *  1. Load prior sessions from MMKV.
 *  2. If the most recent session has no `endTime`, mark it `crashed: true` —
 *     the previous process exited without writing an end marker.
 *  3. Allocate a fresh `sessionId`, prepend it, trim to `maxSessions`,
 *     evicting log/network data for any session that drops off.
 *  4. Tell every passed transport about the new session id.
 *  5. Subscribe to AppState so a clean exit writes `endTime`. Both
 *     `'background'` and `'inactive'` mark the session ended — on iOS the OS
 *     can suspend an app through `'inactive'` without ever reporting
 *     `'background'` (e.g. a fast swipe-to-kill), so listening for
 *     `'background'` alone leaves sessions unclosed and falsely "crashed".
 *     A return to `'active'` reopens the session (clears `endTime`) so a
 *     transient inactive→active blip — control center, an incoming call
 *     overlay — does not prematurely close a live session.
 *
 * Returns a teardown function that removes the AppState subscription.
 *
 * @example
 * ```ts
 * import { createStorage, initSessionManager } from 'react-native-observability/storage';
 * import { MMKVTransport } from 'react-native-observability';
 *
 * const mmkv = createStorage();
 * const mmkvTransport = new MMKVTransport({ storage: mmkv });
 * const end = initSessionManager(mmkv, {
 *   appVersion: '1.2.3',
 *   buildNumber: 42,
 *   transports: [mmkvTransport],
 * });
 * ```
 */
export function initSessionManager(
  mmkv: MMKVLike,
  options: InitSessionManagerOptions
): EndSessionManagerFn {
  _mmkv = mmkv;

  const maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
  const sessions = loadSessions(mmkv);

  // 1. Detect a crashed prior session
  const lastSession = sessions[0];
  if (lastSession !== undefined && lastSession.endTime === undefined) {
    lastSession.crashed = true;
  }

  // 2. Allocate a fresh session
  _currentSessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fresh: SessionMeta = {
    sessionId: _currentSessionId,
    startTime: Date.now(),
    appVersion: options.appVersion,
    buildNumber: options.buildNumber,
  };
  sessions.unshift(fresh);

  // 3. Trim and evict
  if (sessions.length > maxSessions) {
    const evicted = sessions.splice(maxSessions);
    for (const e of evicted) {
      evictSessionData(mmkv, e.sessionId);
    }
  }
  persistSessions(mmkv, sessions);

  // 4. Notify transports
  if (options.transports !== undefined) {
    for (const t of options.transports) {
      t.setSessionId(_currentSessionId);
    }
  }

  // 5. AppState listener. End the session when the app leaves the foreground
  // ('background' OR 'inactive' — see the doc comment: iOS can suspend through
  // 'inactive' without 'background'). Reopen it on return to 'active' so a
  // transient blip doesn't leave a live session falsely marked ended.
  const appState = options.appState ?? loadAppState();
  let subscription: { remove(): void } | null = null;
  if (appState !== null) {
    subscription = appState.addEventListener('change', state => {
      if (state === 'background' || state === 'inactive') {
        endCurrentSession();
      } else if (state === 'active') {
        reopenCurrentSession();
      }
    });
  }

  return () => {
    subscription?.remove();
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function loadSessions(mmkv: MMKVLike): SessionMeta[] {
  const raw = mmkv.getString(SESSIONS_KEY);
  if (raw === undefined) return [];
  const result = deserialize<SessionMeta[]>(raw);
  if (!result.ok || !Array.isArray(result.payload)) return [];
  return result.payload;
}

function persistSessions(mmkv: MMKVLike, sessions: SessionMeta[]): void {
  mmkv.set(SESSIONS_KEY, serialize(sessions));
}

/**
 * Drops every key associated with a session id. Walks all keys because the
 * per-entry scheme used by `MMKVTransport` produces unpredictable keys
 * (`t:l:{sessionId}:{seq}`) and we don't want to track the counter
 * separately just for eviction.
 */
function evictSessionData(mmkv: MMKVLike, sessionId: string): void {
  const prefix = `t:l:${sessionId}:`;
  for (const k of mmkv.getAllKeys()) {
    if (k.startsWith(prefix)) mmkv.delete(k);
  }
}

/**
 * Lazy-load `AppState` from `react-native`. We do this inside the function
 * (not at module top) so test environments without RN don't fail to import
 * the storage module. Returns `null` if RN is not resolvable — the manager
 * still works, it just won't auto-mark sessions ended.
 */
function loadAppState(): AppStateLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native') as { AppState?: AppStateLike };
    return rn.AppState ?? null;
  } catch {
    return null;
  }
}
