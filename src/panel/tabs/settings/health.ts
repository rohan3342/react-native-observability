import type { InternalMetrics } from '../../../logger';

export type HealthStatus = 'healthy' | 'degraded' | 'panic';

export interface HealthRow {
  readonly label: string;
  readonly value: string;
}

export interface HealthSummary {
  readonly status: HealthStatus;
  /** Failures + unexpected drops (only the non-zero ones) — the actual problems. */
  readonly problems: readonly HealthRow[];
  /** Sampling / rate-limit drops — expected because the consumer configured them. */
  readonly expectedDrops: readonly HealthRow[];
}

/**
 * Turns raw {@link InternalMetrics} counters into a human verdict + only the
 * rows worth showing.
 *
 * Degraded = any failure (adapter / transport / storage) OR an *unexpected*
 * drop (queue-full = backpressure overflow, kill-switch = SDK silenced).
 * Sampling and rate-limit drops are expected (the consumer opted into them)
 * so they don't degrade the verdict — they're shown separately as context.
 */
export function summariseHealth(m: InternalMetrics): HealthSummary {
  const problems: HealthRow[] = [];
  if (m.adapter.failures > 0)
    problems.push({ label: 'Adapter failures', value: String(m.adapter.failures) });
  if (m.transport.failures > 0)
    problems.push({ label: 'Transport failures', value: String(m.transport.failures) });
  if (m.storage.quarantines > 0)
    problems.push({ label: 'Storage quarantines', value: String(m.storage.quarantines) });
  if (m.dropped.queueFull > 0)
    problems.push({ label: 'Dropped (queue full)', value: String(m.dropped.queueFull) });
  if (m.dropped.killSwitch > 0)
    problems.push({ label: 'Dropped (kill switch)', value: String(m.dropped.killSwitch) });
  if (m.adapter.queueDepth > 0)
    problems.push({ label: 'Adapter queue backlog', value: String(m.adapter.queueDepth) });

  const expectedDrops: HealthRow[] = [];
  if (m.dropped.sampled > 0)
    expectedDrops.push({ label: 'Sampled out', value: String(m.dropped.sampled) });
  if (m.dropped.rateLimited > 0)
    expectedDrops.push({ label: 'Rate-limited', value: String(m.dropped.rateLimited) });

  const status: HealthStatus = m.panic.tripped
    ? 'panic'
    : problems.length > 0
      ? 'degraded'
      : 'healthy';

  return { status, problems, expectedDrops };
}

/** Human-readable byte size for the Health throughput row. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
