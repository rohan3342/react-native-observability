/**
 * Internal self-telemetry — the telemetry of the telemetry (plan S18).
 *
 * A single module-level counter struct records what the SDK itself is doing:
 * drops (by reason), adapter calls/failures, transport failures, and panic
 * state. It is read through {@link getInternalMetrics} and never mutated by
 * consumers. This is a sanctioned module-singleton (like `SessionManager`):
 * the metrics describe the whole process, so a per-instance value would be
 * meaningless.
 */

/** Snapshot shape returned by {@link getInternalMetrics}. */
export interface InternalMetrics {
  readonly dropped: {
    readonly sampled: number;
    readonly rateLimited: number;
    readonly killSwitch: number;
    readonly queueFull: number;
  };
  readonly adapter: {
    readonly calls: number;
    readonly failures: number;
    readonly queueDepth: number;
  };
  readonly transport: {
    readonly failures: number;
  };
  readonly storage: {
    readonly writes: number;
    readonly bytes: number;
    readonly quarantines: number;
  };
  readonly panic: {
    readonly tripped: boolean;
    readonly reason?: string;
  };
}

interface MutableMetrics {
  dropped: { sampled: number; rateLimited: number; killSwitch: number; queueFull: number };
  adapter: { calls: number; failures: number; queueDepth: number };
  transport: { failures: number };
  storage: { writes: number; bytes: number; quarantines: number };
  panic: { tripped: boolean; reason?: string };
}

function freshMetrics(): MutableMetrics {
  return {
    dropped: { sampled: 0, rateLimited: 0, killSwitch: 0, queueFull: 0 },
    adapter: { calls: 0, failures: 0, queueDepth: 0 },
    transport: { failures: 0 },
    storage: { writes: 0, bytes: 0, quarantines: 0 },
    panic: { tripped: false },
  };
}

const metrics: MutableMetrics = freshMetrics();

/** Kill-switch state. When set, `Logger.write` short-circuits (plan S18). */
let killSwitchReason: string | null = null;

// ─── Panic mode (auto-trip; plan S18) ────────────────────────────────────────
// Panic pauses the adapter fan-out (transports keep running locally) when the
// SDK is clearly unhealthy, and does NOT auto-recover — the consumer must call
// `clearPanic()` (or restart). This prevents flapping. Trip conditions are
// counter-based (not timer-based) so they're deterministic and testable:
//   • `consecutiveQueueFull` reaching a threshold = sustained queue overflow.
//   • `consecutiveStorageFailures` reaching a threshold = storage wedged.

/** Defaults — overridable via {@link configurePanic}. */
const DEFAULT_QUEUE_FULL_TRIP = 1000;
const DEFAULT_STORAGE_FAIL_TRIP = 50;

let queueFullTrip = DEFAULT_QUEUE_FULL_TRIP;
let storageFailTrip = DEFAULT_STORAGE_FAIL_TRIP;
let consecutiveQueueFull = 0;
let consecutiveStorageFailures = 0;

// ─── Mutators (internal — called by the Logger hot path) ────────────────────

/** @internal */
export function incrDropped(reason: keyof MutableMetrics['dropped']): void {
  metrics.dropped[reason]++;
  // Sustained queue overflow trips panic; any non-queueFull activity resets the
  // run since the queue is draining again.
  if (reason === 'queueFull') {
    consecutiveQueueFull++;
    if (!metrics.panic.tripped && queueFullTrip > 0 && consecutiveQueueFull >= queueFullTrip) {
      tripPanic('adapter queue saturated');
    }
  }
}

/** @internal — a task drained to adapters means the queue is moving again. */
export function incrAdapterCalls(): void {
  metrics.adapter.calls++;
  consecutiveQueueFull = 0;
}

/** @internal */
export function incrAdapterFailures(): void {
  metrics.adapter.failures++;
}

/** @internal */
export function setAdapterQueueDepth(depth: number): void {
  metrics.adapter.queueDepth = depth;
}

/** @internal */
export function incrTransportFailures(): void {
  metrics.transport.failures++;
}

/** @internal — one persisted entry of `bytes` size. A success clears the run. */
export function recordStorageWrite(bytes: number): void {
  metrics.storage.writes++;
  metrics.storage.bytes += bytes;
  consecutiveStorageFailures = 0;
}

/** @internal — a persist attempt failed; repeated failures trip panic. */
export function recordStorageFailure(): void {
  consecutiveStorageFailures++;
  if (
    !metrics.panic.tripped &&
    storageFailTrip > 0 &&
    consecutiveStorageFailures >= storageFailTrip
  ) {
    tripPanic('storage persistently failing');
  }
}

/** @internal — a record was quarantined (unknown schema version). */
export function incrStorageQuarantines(): void {
  metrics.storage.quarantines++;
}

/** @internal */
export function tripPanic(reason: string): void {
  metrics.panic.tripped = true;
  metrics.panic.reason = reason;
}

/** @internal — read by `Logger.drain` to pause the adapter fan-out. */
export function isPanicTripped(): boolean {
  return metrics.panic.tripped;
}

/**
 * Clear panic mode and resume the adapter fan-out. Panic never auto-recovers
 * (to avoid flapping), so the consumer calls this once the underlying problem
 * (network, disk) is resolved.
 *
 * @stability stable
 */
export function clearPanic(): void {
  metrics.panic.tripped = false;
  delete metrics.panic.reason;
  consecutiveQueueFull = 0;
  consecutiveStorageFailures = 0;
}

/**
 * Override panic-mode trip thresholds. Pass `0` to disable a trigger.
 * Defaults: queue-full run of 1000, storage-failure run of 50.
 *
 * @stability experimental
 */
export function configurePanic(opts: { queueFullTrip?: number; storageFailTrip?: number }): void {
  if (opts.queueFullTrip !== undefined) queueFullTrip = opts.queueFullTrip;
  if (opts.storageFailTrip !== undefined) storageFailTrip = opts.storageFailTrip;
}

/** @internal — test teardown + `clearKillSwitch`-style resets. */
export function _resetMetrics(): void {
  const f = freshMetrics();
  metrics.dropped = f.dropped;
  metrics.adapter = f.adapter;
  metrics.transport = f.transport;
  metrics.storage = f.storage;
  metrics.panic = f.panic;
  killSwitchReason = null;
  consecutiveQueueFull = 0;
  consecutiveStorageFailures = 0;
  queueFullTrip = DEFAULT_QUEUE_FULL_TRIP;
  storageFailTrip = DEFAULT_STORAGE_FAIL_TRIP;
}

// ─── Kill switch ────────────────────────────────────────────────────────────

/** @internal — read by `Logger.write` once at the top of the hot path. */
export function isKillSwitchActive(): boolean {
  return killSwitchReason !== null;
}

/**
 * Disable all transports and adapters. Every subsequent `logger.*` call returns
 * immediately and increments `dropped.killSwitch`. Wire this to a remote-config
 * flag to silence the SDK in production without shipping a new build.
 *
 * @param reason - optional human-readable reason, surfaced in metrics/panic.
 * @stability stable
 */
export function setKillSwitch(reason?: string): void {
  killSwitchReason = reason ?? 'kill-switch';
}

/**
 * Re-enable the SDK after {@link setKillSwitch}.
 *
 * @stability stable
 */
export function clearKillSwitch(): void {
  killSwitchReason = null;
}

// ─── Reader ─────────────────────────────────────────────────────────────────

/**
 * Returns an immutable snapshot of the SDK's internal health counters: drops by
 * reason, adapter calls/failures/queue depth, transport failures, and panic
 * state. Read it from a consumer dashboard, the panel's Settings tab, or a test
 * asserting there were no silent drops.
 *
 * @stability stable
 * @example
 * ```ts
 * const m = getInternalMetrics();
 * if (m.dropped.queueFull > 0) console.warn('adapter queue overflowing');
 * ```
 */
export function getInternalMetrics(): InternalMetrics {
  return {
    dropped: { ...metrics.dropped },
    adapter: { ...metrics.adapter },
    transport: { ...metrics.transport },
    storage: { ...metrics.storage },
    panic:
      metrics.panic.reason !== undefined
        ? { tripped: metrics.panic.tripped, reason: metrics.panic.reason }
        : { tripped: metrics.panic.tripped },
  };
}
