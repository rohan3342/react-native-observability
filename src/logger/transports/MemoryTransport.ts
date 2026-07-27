import type { ITransport, LogEntry } from '../types';
import { LogLevel } from '../types';

export interface MemoryTransportOptions {
  /** Maximum entries before the oldest is overwritten. Default: `500`. */
  maxEntries?: number;
  minLevel?: LogLevel;
}

/**
 * In-memory transport backed by a pre-allocated O(1) ring buffer.
 *
 * Pre-allocated once — no resizing, no GC pressure. `write()` is genuinely O(1):
 * it stores the entry, updates an incremental byte estimate (no `JSON.stringify`),
 * and marks the snapshot dirty; the O(n) snapshot array is materialized lazily on
 * the next `getSnapshot()` read, so a burst of writes with no reader stays O(1)
 * each. Primary data source for the Debug Panel's Logs tab. Also implements the
 * `useSyncExternalStore` interface so React components can subscribe without polling.
 *
 * @example
 * ```ts
 * const memoryTransport = new MemoryTransport({ maxEntries: 500 });
 * // In a React component:
 * const entries = useSyncExternalStore(memoryTransport.subscribe, memoryTransport.getSnapshot);
 * ```
 */
export class MemoryTransport implements ITransport {
  readonly name = 'memory';
  readonly minLevel: LogLevel;

  private readonly buffer: LogEntry[];
  private readonly maxEntries: number;
  private head = 0;
  private count = 0;
  private snapshot: readonly LogEntry[] = [];
  /** True when the buffer changed since `snapshot` was last rebuilt (PERF-1). */
  private snapshotDirty = false;
  private readonly listeners = new Set<() => void>();
  /** Listeners that only fire when a write matches their predicate. */
  private readonly filteredListeners = new Set<{
    filter: (entry: LogEntry) => boolean;
    listener: () => void;
  }>();
  /** Running approximate byte total of live entries (see {@link getBytesApprox}). */
  private bytesApprox = 0;

  constructor(options: MemoryTransportOptions = {}) {
    this.maxEntries = options.maxEntries ?? 500;
    this.minLevel = options.minLevel ?? LogLevel.DEBUG;
    this.buffer = new Array<LogEntry>(this.maxEntries);
  }

  /** Write an entry into the ring buffer. O(1). */
  write(entry: LogEntry): void {
    const index = (this.head + this.count) % this.maxEntries;
    if (this.count >= this.maxEntries) {
      // Buffer full — the entry currently at `index` (the oldest) is evicted.
      const evicted = this.buffer[index];
      if (evicted !== undefined) this.bytesApprox -= approxBytes(evicted);
    }
    this.buffer[index] = entry;
    this.bytesApprox += approxBytes(entry);
    if (this.count < this.maxEntries) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.maxEntries;
    }
    this.invalidateSnapshot();
    this.notifyFiltered(entry);
  }

  /** Returns all entries in chronological order (oldest first). */
  getEntries(): LogEntry[] {
    const result: LogEntry[] = [];
    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[(this.head + i) % this.maxEntries];
      if (entry !== undefined) result.push(entry);
    }
    return result;
  }

  /**
   * Returns a sorted unique list of namespaces currently in the buffer.
   * Used by the Logs tab to build dynamic namespace filter chips.
   */
  getNamespaces(): string[] {
    const seen = new Set<string>();
    for (let i = 0; i < this.count; i++) {
      const entry = this.buffer[(this.head + i) % this.maxEntries];
      if (entry !== undefined) seen.add(entry.namespace);
    }
    return [...seen].sort();
  }

  /**
   * Clears all entries without deallocating.
   * Call on user logout to avoid leaking one user's logs into the next session.
   */
  clear(): void {
    this.head = 0;
    this.count = 0;
    this.bytesApprox = 0;
    this.invalidateSnapshot();
  }

  /**
   * Approximate total size, in bytes, of the entries currently held in the
   * buffer. Maintained incrementally on every write/eviction so the call is
   * O(1) — suitable for the panel's "memory used" row, polled on render.
   *
   * The figure is a **rough estimate** of JS string/heap footprint
   * (UTF-16-ish: 2 bytes per character of the serialized message + context +
   * error), not an exact `JSON.stringify().length`. Use it for relative
   * pressure ("are we near the cap?"), not billing-grade accounting.
   */
  getBytesApprox(): number {
    return this.bytesApprox;
  }

  /**
   * Subscribe to writes that match `filter`. Unlike {@link subscribe} (which
   * fires on every write), the listener is invoked **only** when a written
   * entry satisfies the predicate — so a tab watching, say, ERROR-level entries
   * does not re-render on unrelated DEBUG writes. Returns an unsubscribe
   * function. Does not fire on {@link clear}.
   *
   * @param filter - predicate evaluated against each newly written entry
   * @param listener - invoked when an entry matches
   * @returns an unsubscribe function
   *
   * @example
   * ```ts
   * const off = memoryTransport.subscribeWithFilter(
   *   e => e.level >= LogLevel.ERROR,
   *   () => refreshErrorBadge(),
   * );
   * ```
   */
  subscribeWithFilter(filter: (entry: LogEntry) => boolean, listener: () => void): () => void {
    const record = { filter, listener };
    this.filteredListeners.add(record);
    return () => this.filteredListeners.delete(record);
  }

  private notifyFiltered(entry: LogEntry): void {
    for (const { filter, listener } of this.filteredListeners) {
      let matches = false;
      try {
        matches = filter(entry);
      } catch {
        // A throwing predicate must not break the write path.
        matches = false;
      }
      if (matches) listener();
    }
  }

  /**
   * Subscribe to buffer changes. Returns an unsubscribe function.
   * Implements the `subscribe` parameter of `useSyncExternalStore`.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Returns a stable snapshot reference that only changes on write or clear.
   * Implements the `getSnapshot` parameter of `useSyncExternalStore`.
   */
  getSnapshot = (): readonly LogEntry[] => {
    // Rebuild lazily: the O(n) array materialization happens once per read, not
    // once per write. A burst of N writes with no intervening read costs O(1)
    // each; the first reader pays the single O(n) (PERF-1).
    if (this.snapshotDirty) {
      this.snapshot = this.getEntries();
      this.snapshotDirty = false;
    }
    return this.snapshot;
  };

  private invalidateSnapshot(): void {
    // Mark dirty (cheap) instead of rebuilding the snapshot on every write, then
    // notify subscribers — they pull a fresh snapshot via getSnapshot(). With no
    // subscribers, nothing is rebuilt until something actually reads.
    this.snapshotDirty = true;
    for (const listener of this.listeners) listener();
  }
}

/**
 * Rough byte estimate for a single entry — the message, namespace, context, and
 * error text at ~2 bytes/char (UTF-16 heap footprint), plus a small fixed
 * overhead for the numeric/id fields.
 *
 * Avoids `JSON.stringify` on the hot path (PERF-1): the context is estimated by
 * a shallow, depth-bounded walk of keys + primitive value lengths instead of
 * full serialization. The figure is for relative pressure ("near the cap?"), not
 * billing-grade accounting, so an approximation is fine. Never throws.
 */
function approxBytes(entry: LogEntry): number {
  let chars = entry.message.length + entry.namespace.length + entry.id.length;
  if (entry.context !== undefined) {
    chars += estimateChars(entry.context, 0);
  }
  if (entry.error !== undefined) {
    chars += entry.error.message.length + (entry.error.stack?.length ?? 0);
  }
  // 2 bytes/char + ~32 bytes fixed overhead (timestamp, level, sessionId, refs).
  return chars * 2 + 32;
}

/** Shallow, depth-bounded character estimate for a context value (no stringify). */
function estimateChars(value: unknown, depth: number): number {
  if (value === null || value === undefined) return 4;
  switch (typeof value) {
    case 'string':
      return value.length;
    case 'number':
    case 'boolean':
      return 8;
    case 'object': {
      if (depth >= 3) return 16; // stop descending — flat estimate past depth 3
      let sum = 0;
      if (Array.isArray(value)) {
        for (const item of value) sum += estimateChars(item, depth + 1);
      } else {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          sum += k.length + estimateChars(v, depth + 1);
        }
      }
      return sum;
    }
    default:
      return 8;
  }
}
