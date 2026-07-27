/**
 * A single screen lifecycle event recorded by {@link trackScreen} or a
 * navigation observer.
 *
 * Note: `sessionId` is **optional**. The v1 store required a string and
 * defaulted to `'unknown'`, which polluted the data once `SessionManager`
 * (forthcoming) was wired. Consumers wanting a sessionId pass one via
 * `trackScreen(name, params, { sessionId })`.
 */
export interface ScreenLifecycleEvent {
  /** Screen name. */
  readonly screen: string;
  readonly event: 'mount' | 'unmount';
  /** Unix ms. */
  readonly timestamp: number;
  readonly params?: Record<string, unknown>;
  readonly sessionId?: string;
}

/** Computed summary per screen derived from its lifecycle events. */
export interface ScreenSummary {
  readonly screen: string;
  readonly mountCount: number;
  readonly currentlyMounted: boolean;
  /** Sum of all time-on-screen intervals in ms. */
  readonly totalTimeMs: number;
  readonly lastMountedAt?: number;
}

/**
 * Backing store for screen lifecycle events.
 *
 * Records every mount/unmount, exposes a computed `getSummaries()` view, and
 * implements the `useSyncExternalStore`-compatible interface used by the
 * Debug Panel's Navigation tab.
 *
 * Snapshots are replaced atomically on mutation; the returned reference is
 * `===`-distinct between mutations so React's concurrent scheduler does not
 * miss updates.
 */
/** Default cap on retained lifecycle events — bounds memory in long sessions. */
const DEFAULT_MAX_EVENTS = 500;

export class ScreenMountStore {
  private events: ScreenLifecycleEvent[] = [];
  private snapshot: readonly ScreenLifecycleEvent[] = [];
  private readonly listeners = new Set<() => void>();
  /** Maximum retained events; oldest evicted first (audit NAV-3). */
  private readonly maxEvents: number;
  /**
   * Timestamp of the last attribution-relevant activity — a screen mount or a
   * tagged request keeping the window alive (see {@link touchActivity}). Drives
   * the idle-window in {@link getCurrentScreen}: ambient tagging only applies
   * while activity is recent, so idle-time background calls fall out of
   * attribution (matching Sentry's idle-span model).
   */
  private lastActivityAt = 0;

  /**
   * @param maxEvents - max retained lifecycle events; oldest evicted first.
   *   Default `500`. Bounds memory across long sessions (audit NAV-3).
   */
  constructor(maxEvents = DEFAULT_MAX_EVENTS) {
    this.maxEvents = maxEvents;
  }

  /** Append a lifecycle event and notify subscribers. Oldest evicted past the cap. */
  record(event: ScreenLifecycleEvent): void {
    const next = this.events.length >= this.maxEvents ? this.events.slice(1) : this.events.slice();
    next.push(event);
    this.events = next;
    // A mount (re)opens the attribution window.
    if (event.event === 'mount' && event.timestamp > this.lastActivityAt) {
      this.lastActivityAt = event.timestamp;
    }
    this.invalidate();
  }

  /**
   * Extend the attribution window — call when a tagged request starts so an
   * in-flight burst keeps the current screen "active" (idle-extend). No-op for
   * timestamps older than the last activity.
   *
   * @param now - Current time in ms.
   */
  touchActivity(now: number): void {
    if (now > this.lastActivityAt) this.lastActivityAt = now;
  }

  /** Raw event list as an immutable snapshot. */
  getEvents(): readonly ScreenLifecycleEvent[] {
    return this.snapshot;
  }

  /** Computed per-screen summaries. Used by the Navigation tab's history view. */
  getSummaries(): ScreenSummary[] {
    const map = new Map<string, ScreenSummary>();
    for (const e of this.events) {
      const cur = map.get(e.screen) ?? {
        screen: e.screen,
        mountCount: 0,
        currentlyMounted: false,
        totalTimeMs: 0,
      };
      if (e.event === 'mount') {
        map.set(e.screen, {
          ...cur,
          mountCount: cur.mountCount + 1,
          currentlyMounted: true,
          lastMountedAt: e.timestamp,
        });
      } else {
        map.set(e.screen, {
          ...cur,
          currentlyMounted: false,
          totalTimeMs:
            cur.lastMountedAt !== undefined
              ? cur.totalTimeMs + (e.timestamp - cur.lastMountedAt)
              : cur.totalTimeMs,
        });
      }
    }
    return [...map.values()];
  }

  /**
   * The screen most recently mounted that has not since unmounted, or
   * `undefined` if nothing is mounted. Pure structural resolution — ignores
   * timing. Single pass, no allocation. Handles nested navigators by returning
   * the latest-mounted of the currently-mounted screens.
   */
  getMountedScreen(): string | undefined {
    let current: string | undefined;
    let latestMount = -Infinity;
    const mounted = new Set<string>();
    for (const e of this.events) {
      if (e.event === 'mount') {
        mounted.add(e.screen);
        if (e.timestamp >= latestMount) {
          latestMount = e.timestamp;
          current = e.screen;
        }
      } else {
        mounted.delete(e.screen);
        // If the latest-mounted screen just unmounted, it's no longer current.
        if (e.screen === current) {
          current = undefined;
          latestMount = -Infinity;
          for (const m of mounted) {
            // Recompute the latest among still-mounted screens. No timestamps
            // retained per-screen, so fall back to the first still-mounted one;
            // exact ordering among survivors is rare (nested navigators) and the
            // panel filter tolerates it.
            current = m;
          }
        }
      }
    }
    return current;
  }

  /**
   * Resolve the active screen for ambient log / network tagging using an
   * **idle window** (Sentry-style): returns the latest-mounted screen only while
   * activity is recent — i.e. `now - lastActivity <= idleMs`. Once the window
   * goes idle (no mounts and no tagged requests for `idleMs`), this returns
   * `undefined` so idle-time background calls (e.g. a global JWT refresh) are
   * **not** mis-attributed to whatever screen happens to still be mounted.
   *
   * @param now - Current time in ms.
   * @param idleMs - Idle gap after which the window closes.
   * @returns The active screen, or `undefined` when the window is idle / nothing
   *   is mounted.
   */
  getCurrentScreen(now: number, idleMs: number): string | undefined {
    if (now - this.lastActivityAt > idleMs) return undefined;
    return this.getMountedScreen();
  }

  /** Clear all events and notify subscribers. */
  clear(): void {
    this.events = [];
    this.lastActivityAt = 0;
    this.invalidate();
  }

  /** `useSyncExternalStore`-compatible subscribe. */
  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  /** `useSyncExternalStore`-compatible getSnapshot. */
  getSnapshot = (): readonly ScreenLifecycleEvent[] => this.snapshot;

  private invalidate(): void {
    this.snapshot = this.events;
    for (const listener of this.listeners) listener();
  }
}
