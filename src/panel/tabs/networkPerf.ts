import type { NetworkLogEntry } from '../../integrations/http';

/** Per-endpoint latency + reliability aggregate. */
export interface EndpointStat {
  /** Normalised endpoint key, e.g. `GET /users/:id`. */
  readonly endpoint: string;
  /** HTTP method (split out for the method badge). */
  readonly method: string;
  /** Normalised path (without the method), e.g. `/users/:id`. */
  readonly path: string;
  /** Number of completed (non-pending) requests aggregated. */
  readonly count: number;
  /** Median (p50) duration in ms. */
  readonly p50: number;
  /** 95th-percentile duration in ms. */
  readonly p95: number;
  /** Slowest observed duration in ms. */
  readonly max: number;
  /** Failures (error state or status >= 400) as a 0..1 fraction. */
  readonly errorRate: number;
}

/**
 * Normalises a URL into an endpoint template so requests to the same route
 * aggregate together: the origin is dropped, numeric and UUID/hex path segments
 * become `:id`, and the query string is stripped. `/api/users/42?x=1` and
 * `/api/users/99` both become `/api/users/:id`.
 */
export function normaliseEndpoint(url: string): string {
  // Strip scheme + host (best-effort; keep the path for relative URLs).
  let path = url;
  const schemeIdx = path.indexOf('://');
  if (schemeIdx !== -1) {
    const afterHost = path.indexOf('/', schemeIdx + 3);
    path = afterHost === -1 ? '/' : path.slice(afterHost);
  }
  // Drop query + fragment.
  path = path.split('?')[0]!.split('#')[0]!;
  return (
    path
      .split('/')
      .map(seg => {
        if (seg === '') return seg;
        if (/^\d+$/.test(seg)) return ':id';
        if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(seg)) return ':id'; // uuid
        if (/^[0-9a-f]{16,}$/i.test(seg)) return ':id'; // long hex id
        return seg;
      })
      .join('/') || '/'
  );
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const frac = rank - lo;
  return sorted[lo]! * (1 - frac) + sorted[hi]! * frac;
}

function isFailure(e: NetworkLogEntry): boolean {
  return e.state === 'error' || (e.statusCode !== undefined && e.statusCode >= 400);
}

/**
 * Aggregates captured network entries into per-endpoint latency/reliability
 * stats, sorted slowest-p95-first. Pending entries (no `durationMs`) are
 * ignored. Pure — recompute over the live snapshot whenever the panel renders.
 */
export function aggregateEndpoints(entries: readonly NetworkLogEntry[]): EndpointStat[] {
  const groups = new Map<
    string,
    { method: string; path: string; durations: number[]; failures: number; total: number }
  >();

  for (const e of entries) {
    if (e.durationMs === undefined || e.state === 'pending') continue;
    const method = e.method.toUpperCase();
    const path = normaliseEndpoint(e.url);
    const key = `${method} ${path}`;
    let g = groups.get(key);
    if (g === undefined) {
      g = { method, path, durations: [], failures: 0, total: 0 };
      groups.set(key, g);
    }
    g.durations.push(e.durationMs);
    g.total++;
    if (isFailure(e)) g.failures++;
  }

  const out: EndpointStat[] = [];
  for (const [endpoint, g] of groups) {
    const sorted = g.durations.slice().sort((a, b) => a - b);
    out.push({
      endpoint,
      method: g.method,
      path: g.path,
      count: g.total,
      p50: Math.round(percentile(sorted, 50)),
      p95: Math.round(percentile(sorted, 95)),
      max: Math.round(sorted[sorted.length - 1] ?? 0),
      errorRate: g.total === 0 ? 0 : g.failures / g.total,
    });
  }
  return out.sort((a, b) => b.p95 - a.p95);
}
