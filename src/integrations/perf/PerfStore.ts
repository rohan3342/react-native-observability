/** A completed performance span recorded via {@link trackPerformance}. */
export interface PerfSpan {
  /** Operation name, e.g. `'image-decode'` or `'render:Home'`. */
  readonly name: string;
  /** Duration in ms. */
  readonly durationMs: number;
  /** Unix ms when the span started. */
  readonly startedAt: number;
  /** Optional structured context recorded with the span. */
  readonly context?: Readonly<Record<string, unknown>>;
}

const DEFAULT_MAX = 200;

/**
 * Ring-buffer store of completed {@link PerfSpan}s, with the
 * `useSyncExternalStore`-compatible interface the panel's Performance tab reads.
 * Snapshots are replaced atomically (a `===`-distinct array per mutation) so
 * React's concurrent scheduler never misses an update.
 */
export class PerfStore {
  private spans: PerfSpan[] = [];
  private snapshot: readonly PerfSpan[] = [];
  private readonly listeners = new Set<() => void>();
  private readonly maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX) {
    this.maxEntries = maxEntries;
  }

  /** Record a finished span. Oldest is dropped past `maxEntries`. */
  add(span: PerfSpan): void {
    this.spans =
      this.spans.length >= this.maxEntries ? [...this.spans.slice(1), span] : [...this.spans, span];
    this.snapshot = this.spans;
    for (const l of this.listeners) l();
  }

  /** Clear all recorded spans. */
  clear(): void {
    this.spans = [];
    this.snapshot = this.spans;
    for (const l of this.listeners) l();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): readonly PerfSpan[] => this.snapshot;
}

/**
 * Process-wide default perf store the panel reads and {@link trackPerformance}
 * writes to when no explicit store is passed. A singleton (like the screen
 * store) so a `trackPerformance()` call anywhere lands in the same buffer the
 * panel renders.
 */
let defaultStore: PerfStore | null = null;

/** Returns the singleton {@link PerfStore} (lazily created). */
export function getPerfStore(): PerfStore {
  if (defaultStore === null) defaultStore = new PerfStore();
  return defaultStore;
}

/** @internal — test reset. */
export function _resetPerfStore(): void {
  defaultStore = null;
}
