import type { Logger } from '../../logger/Logger';
import { getPerfStore, type PerfStore } from './PerfStore';

/** Options for {@link trackPerformance}. */
export interface TrackPerformanceOptions {
  /**
   * Optional logger. When provided, the completed span is also logged at DEBUG
   * (`perf:<name>` with `durationMs`) so it shows in the Logs tab / adapters.
   */
  readonly logger?: Logger;
  /** Store to record into. Defaults to the singleton {@link getPerfStore}. */
  readonly store?: PerfStore;
}

/** Handle returned by {@link trackPerformance}. */
export interface PerfSpanHandle {
  /**
   * End the span and record its duration. Optionally merge extra context.
   * Idempotent — a second call is ignored (so an `end()` in both a try and a
   * finally is safe). Returns the measured duration in ms.
   */
  end(context?: Record<string, unknown>): number;
}

/**
 * Starts a performance span. Call `end()` when the measured work finishes; the
 * duration is recorded into the perf store (read by the panel's Performance
 * tab) and, if a logger is given, logged at DEBUG.
 *
 * Provider-agnostic and dependency-free — measure anything (an image decode, a
 * parse, a screen-to-interactive window). Uses `Date.now()` deltas, so it is
 * coarse (ms) but universally available.
 *
 * @example
 * ```ts
 * const span = trackPerformance('decode-avatar', { logger });
 * await decode();
 * span.end({ bytes: 40_000 });
 * ```
 *
 * @stability experimental
 */
export function trackPerformance(name: string, opts: TrackPerformanceOptions = {}): PerfSpanHandle {
  const store = opts.store ?? getPerfStore();
  const startedAt = Date.now();
  let ended = false;

  return {
    end(context?: Record<string, unknown>): number {
      if (ended) return 0;
      ended = true;
      const durationMs = Date.now() - startedAt;
      store.add({
        name,
        durationMs,
        startedAt,
        ...(context !== undefined ? { context } : {}),
      });
      opts.logger?.debug(`perf:${name}`, { durationMs, ...(context ?? {}) });
      return durationMs;
    },
  };
}
