import { incrAdapterFailures, incrTransportFailures } from './metrics';

/**
 * Internal-only logger for the SDK's own failures (plan S18). It writes to
 * `console.warn` **only** when `__DEV__` is true and **never** calls back into a
 * `Logger`, transport, or adapter — so a broken transport can't trigger a log
 * that re-enters the broken transport (no recursion). It also bumps the
 * matching internal-metrics counter.
 *
 * This replaces the inline `reportInternalFailure` placeholder.
 */
export const SelfLogger = {
  /** A transport's `write()` threw. Isolated + counted. */
  transportFailed(name: string, error: unknown): void {
    incrTransportFailures();
    warn(`transport "${name}" threw and was isolated`, error);
  },

  /** An adapter call threw. Isolated + counted. */
  adapterFailed(name: string, error: unknown): void {
    incrAdapterFailures();
    warn(`adapter "${name}" threw and was isolated`, error);
  },

  /** A generic internal warning (e.g. panic tripped). Counted by the caller. */
  warn(message: string, detail?: unknown): void {
    warn(message, detail);
  },
};

function warn(message: string, detail?: unknown): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  if (detail !== undefined) {
    console.warn(`[observability] ${message}:`, detail);
  } else {
    console.warn(`[observability] ${message}`);
  }
}
