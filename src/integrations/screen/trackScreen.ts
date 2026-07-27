import type { Logger } from '../../logger/Logger';
import { ScreenMountStore } from './ScreenMountStore';

/** Module-level singleton. Created lazily on first access. */
let store: ScreenMountStore | null = null;

/** Returns the shared {@link ScreenMountStore}. Lazy — the store is allocated on first call. */
export function getScreenStore(): ScreenMountStore {
  if (store === null) store = new ScreenMountStore();
  return store;
}

/** Options for {@link trackScreen}. */
export interface TrackScreenOptions {
  /** Optional Observability logger. When provided, mount/unmount are also logged. */
  logger?: Logger;
  /** Optional sessionId stamped onto the event (typically from `SessionManager`). */
  sessionId?: string;
}

/**
 * Records a screen mount event and returns an unmount callback.
 *
 * Provider-agnostic — knows nothing about React Navigation. Used directly
 * inside screen components, or wrapped by a vendor adapter (e.g.
 * `useScreenTracker` from `react-native-observability/observers/react-navigation`).
 *
 * @example
 * ```ts
 * useEffect(() => trackScreen('AccountsScreen', route.params, { logger }), []);
 * ```
 *
 * @returns A function that records the corresponding `unmount` event. Call
 * once when the screen leaves the tree.
 */
export function trackScreen(
  name: string,
  params?: Record<string, unknown>,
  opts?: TrackScreenOptions
): () => void {
  const s = getScreenStore();
  const mountTs = Date.now();
  s.record({
    screen: name,
    event: 'mount',
    timestamp: mountTs,
    ...(params !== undefined ? { params } : {}),
    ...(opts?.sessionId !== undefined ? { sessionId: opts.sessionId } : {}),
  });
  opts?.logger?.info('screen:mount', { screen: name, params });

  return () => {
    s.record({
      screen: name,
      event: 'unmount',
      timestamp: Date.now(),
      ...(params !== undefined ? { params } : {}),
      ...(opts?.sessionId !== undefined ? { sessionId: opts.sessionId } : {}),
    });
    opts?.logger?.info('screen:unmount', { screen: name });
  };
}

/** Default idle window (ms) after which ambient screen tagging stops. */
export const DEFAULT_SCREEN_IDLE_MS = 1_000;

/** Options for {@link createScreenProvider}. */
export interface CreateScreenProviderOptions {
  /**
   * Idle gap in ms after the last navigation / tagged request, after which the
   * provider returns `undefined` so idle-time background calls aren't attributed
   * to a still-mounted screen. Default {@link DEFAULT_SCREEN_IDLE_MS} (1000ms,
   * matching Sentry's idle default).
   */
  readonly idleMs?: number;
  /**
   * Clock injection for tests. Defaults to `Date.now`. MUST be cheap — it is
   * called on the logger's hot path.
   */
  readonly now?: () => number;
}

/**
 * Returns a cheap synchronous provider that resolves the currently-active screen
 * from the shared screen store, using an **idle window** (Sentry-style). Wire it
 * into `createLogger` and `createHttpObserver` to tag logs / network entries
 * with the screen active when they fired — powering the panel's per-screen
 * filters.
 *
 * **Attribution model.** A navigation opens a window; it stays "active" while
 * activity (mounts, in-flight tagged requests) is recent. Once idle for
 * `idleMs`, the provider returns `undefined`, so a background call made while
 * the user sits idle on a screen is **not** mis-attributed to it. Pass an
 * explicit `screen` at the call site to override the ambient value (or `null` to
 * force "no screen") — see `LoggerConfig.screenProvider` /
 * `CreateHttpObserverOptions.screenProvider`.
 *
 * @example
 * ```ts
 * import { createLogger, createHttpObserver, createScreenProvider } from 'react-native-observability';
 *
 * const screenProvider = createScreenProvider();
 * const logger = createLogger({ namespace: 'app', level: LogLevel.DEBUG, transports, screenProvider });
 * const http = createHttpObserver({ logger, screenProvider });
 * ```
 *
 * @returns A function returning the active screen name, or `undefined` when the
 * window is idle / nothing is mounted.
 */
export function createScreenProvider(
  options: CreateScreenProviderOptions = {}
): () => string | undefined {
  const s = getScreenStore();
  const idleMs = options.idleMs ?? DEFAULT_SCREEN_IDLE_MS;
  const now = options.now ?? Date.now;
  return () => s.getCurrentScreen(now(), idleMs);
}

/**
 * Extend the ambient attribution window — call when a tagged request *starts* so
 * an in-flight burst keeps the current screen active (idle-extend, mirroring how
 * Sentry's in-flight child spans keep a navigation span alive). Used internally
 * by `createHttpObserver`; rarely needed directly.
 *
 * @param now - Current time in ms. Defaults to `Date.now()`.
 */
export function touchScreenActivity(now: number = Date.now()): void {
  getScreenStore().touchActivity(now);
}

/** @internal — test teardown only. */
export function _resetScreenStore(): void {
  store = null;
}
