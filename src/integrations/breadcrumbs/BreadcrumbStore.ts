/**
 * Unified breadcrumb timeline (plan S25 / T5-6).
 *
 * A single always-on ring buffer that merges the events leading up to "now" —
 * logs, network requests, navigation, and custom marks — into one chronological
 * stream. This is the "what led here" view (Sentry-style breadcrumbs), and the
 * basis of the **crash trail**: the buffer is mirrored to an injected persistent
 * store keyed per session, so after a crashed session the prior run's last
 * breadcrumbs can be replayed on next launch (see {@link BreadcrumbPersistence}).
 *
 * The store is provider-agnostic: vendor shims / the logger feed it `record()`
 * calls; it knows nothing about any of them.
 */

/** What produced a breadcrumb — drives the timeline's icon/colour + filtering. */
export type BreadcrumbKind = 'log' | 'network' | 'navigation' | 'custom';

/** Severity, mainly for the timeline tint (mirrors log levels loosely). */
export type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error';

/** One entry in the timeline. */
export interface Breadcrumb {
  /** Monotonic-ish id (timestamp + counter) — stable list key. */
  readonly id: string;
  /** Unix ms. */
  readonly timestamp: number;
  readonly kind: BreadcrumbKind;
  readonly level: BreadcrumbLevel;
  /** One-line human summary, e.g. `GET /users/1 → 200` or a log message. */
  readonly message: string;
  /** Optional category within the kind (log namespace, http method, screen). */
  readonly category?: string;
  /** Optional small structured detail (kept compact — this is persisted). */
  readonly data?: Readonly<Record<string, unknown>>;
}

/**
 * Minimal synchronous persistence for the rolling crash-trail buffer. Satisfied
 * by `react-native-mmkv` (with a tiny adapter) or any sync key→string store;
 * shares the shape of the panel's persistence. When omitted, breadcrumbs live in
 * memory only (the live timeline still works; there's just no cross-launch
 * crash trail).
 */
export interface BreadcrumbPersistence {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const DEFAULT_MAX = 100;
const KEY_PREFIX = 'observability.breadcrumbs.';

/**
 * Ring-buffer store of {@link Breadcrumb}s with the
 * `useSyncExternalStore`-compatible interface the panel reads. Snapshots are
 * `===`-distinct per mutation so React's concurrent scheduler never misses an
 * update. Optionally mirrors the buffer to a {@link BreadcrumbPersistence} under
 * a per-session key for crash-trail recovery.
 */
export class BreadcrumbStore {
  private crumbs: Breadcrumb[] = [];
  private snapshot: readonly Breadcrumb[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly maxEntries: number;
  private persistence: BreadcrumbPersistence | null = null;
  private sessionId: string | null = null;
  private seq = 0;

  constructor(maxEntries = DEFAULT_MAX) {
    this.maxEntries = maxEntries;
  }

  /**
   * Wire persistence + the current session id. Subsequent `record()` calls
   * mirror the rolling buffer to `persistence` under `observability.breadcrumbs.<id>`.
   * A no-op when persistence is null (in-memory only).
   *
   * @param persistence - sync store, or null for in-memory only.
   * @param sessionId - current session id (the persistence key suffix).
   */
  configurePersistence(persistence: BreadcrumbPersistence | null, sessionId: string): void {
    this.persistence = persistence;
    this.sessionId = sessionId;
  }

  /** Append a breadcrumb. Oldest is dropped past `maxEntries`. Mirrors to disk. */
  record(crumb: Omit<Breadcrumb, 'id'> & { id?: string }): void {
    const full: Breadcrumb = {
      ...crumb,
      id: crumb.id ?? `bc-${crumb.timestamp}-${(this.seq++).toString(36)}`,
    };
    this.crumbs =
      this.crumbs.length >= this.maxEntries
        ? [...this.crumbs.slice(1), full]
        : [...this.crumbs, full];
    this.snapshot = this.crumbs;
    this.persist();
    for (const l of this.listeners) l();
  }

  /** Clear the live buffer (does not touch persisted trails of other sessions). */
  clear(): void {
    this.crumbs = [];
    this.snapshot = this.crumbs;
    this.persist();
    for (const l of this.listeners) l();
  }

  /**
   * Load the persisted breadcrumb trail for a given (prior) session — the crash
   * trail. Returns `[]` when no persistence is wired or nothing was stored.
   */
  loadTrail(sessionId: string): Breadcrumb[] {
    if (this.persistence === null) return [];
    try {
      const raw = this.persistence.getItem(`${KEY_PREFIX}${sessionId}`);
      if (raw === null) return [];
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as Breadcrumb[]) : [];
    } catch {
      return [];
    }
  }

  /** Drop a persisted trail (e.g. after the user dismisses the crash banner). */
  clearTrail(sessionId: string): void {
    if (this.persistence === null) return;
    try {
      this.persistence.removeItem?.(`${KEY_PREFIX}${sessionId}`);
    } catch {
      // best-effort
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly Breadcrumb[] => this.snapshot;

  private persist(): void {
    if (this.persistence === null || this.sessionId === null) return;
    try {
      this.persistence.setItem(`${KEY_PREFIX}${this.sessionId}`, JSON.stringify(this.crumbs));
    } catch {
      // Persistence is best-effort — a failed write must never break logging.
    }
  }
}

/** Module-level singleton — every recorder feeds the same buffer the panel reads. */
let store: BreadcrumbStore | null = null;

/** Returns the shared {@link BreadcrumbStore} (lazily created). */
export function getBreadcrumbStore(): BreadcrumbStore {
  if (store === null) store = new BreadcrumbStore();
  return store;
}

/** @internal — test teardown only. */
export function _resetBreadcrumbStore(): void {
  store = null;
}
