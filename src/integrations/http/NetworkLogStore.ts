import type { HttpEventEnd, HttpEventStart } from './types';

/**
 * One captured network request/response entry stored by {@link NetworkLogStore}.
 *
 * Replaces the v1 vendor-coupled `NetworkLogEntry` from `integrations/axios`.
 */
export interface NetworkLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly method: string;
  readonly url: string;
  readonly source: HttpEventStart['source'];
  readonly requestHeaders?: Record<string, string>;
  readonly requestBody?: unknown;
  readonly statusCode?: number;
  readonly durationMs?: number;
  readonly responseHeaders?: Record<string, string>;
  readonly responseBody?: unknown;
  readonly error?: string;
  readonly state: 'pending' | 'success' | 'error' | 'cancelled';
  /**
   * Name of the screen active when this request was dispatched, resolved via
   * {@link CreateHttpObserverOptions.screenProvider}. Undefined when no provider
   * is wired. Powers the panel's per-screen network filter.
   */
  readonly screen?: string;
  /**
   * Returns a copy-pasteable `curl` command reconstructing this request.
   * Single quotes inside the body are shell-escaped.
   */
  toCurl(): string;
}

/** Fields patched onto an entry when its end event arrives. */
export type NetworkLogPatch = Partial<
  Pick<
    NetworkLogEntry,
    'statusCode' | 'durationMs' | 'responseHeaders' | 'responseBody' | 'error' | 'state'
  >
>;

/**
 * In-memory ring buffer of {@link NetworkLogEntry}.
 *
 * Implements the `useSyncExternalStore`-compatible interface used by the
 * Debug Panel's Network tab. `getSnapshot()` returns an immutable array that
 * is replaced atomically on every mutation — this fixes the v1 bug (audit
 * I8 / E12) where mutating `this.entries` in place while returning the same
 * reference could miss re-renders under React's concurrent scheduler.
 */
export class NetworkLogStore {
  private readonly maxSize: number;
  private entries: NetworkLogEntry[] = [];
  private snapshot: readonly NetworkLogEntry[] = [];
  private readonly listeners = new Set<() => void>();

  /**
   * @param maxSize - Maximum entries retained. Oldest evicted first. Default `200`.
   */
  constructor(maxSize = 200) {
    this.maxSize = maxSize;
  }

  /**
   * Add a new entry, evicting the oldest when `maxSize` is reached.
   * The snapshot is replaced atomically.
   */
  add(entry: NetworkLogEntry): void {
    const next = this.entries.length >= this.maxSize ? this.entries.slice(1) : this.entries.slice();
    next.push(entry);
    this.entries = next;
    this.invalidate();
  }

  /**
   * Patch an existing entry by id. No-op when the id is not found.
   * Replaces the entry object — never mutates in place.
   */
  update(id: string, patch: NetworkLogPatch): void {
    const idx = this.entries.findIndex(e => e.id === id);
    if (idx === -1) return;
    const existing = this.entries[idx];
    if (existing === undefined) return;
    const next = this.entries.slice();
    next[idx] = { ...existing, ...patch, toCurl: existing.toCurl };
    this.entries = next;
    this.invalidate();
  }

  /**
   * Immutable snapshot. The returned reference changes (`===`-distinct) on
   * every mutation. Suitable as `getSnapshot` for `useSyncExternalStore`.
   */
  getSnapshot = (): readonly NetworkLogEntry[] => this.snapshot;

  /**
   * Subscribe to mutations. Returns an unsubscribe callback.
   * Suitable as `subscribe` for `useSyncExternalStore`.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Remove all entries and notify subscribers. */
  clear(): void {
    this.entries = [];
    this.invalidate();
  }

  private invalidate(): void {
    this.snapshot = this.entries;
    for (const listener of this.listeners) listener();
  }
}

/**
 * Serialise an HTTP event pair into a {@link NetworkLogEntry}.
 *
 * Called by {@link createHttpObserver} on `onStart`; the entry's `toCurl()`
 * closure captures the request data at this moment, so cURL reconstruction
 * works even after the entry has been patched with a response.
 *
 * @param start - The captured request-start event.
 * @param screen - Optional active-screen name to tag the entry with.
 */
export function buildPendingEntry(start: HttpEventStart, screen?: string): NetworkLogEntry {
  const captured = {
    method: start.method,
    url: start.url,
    headers: start.headers,
    body: start.body,
  };
  return {
    id: start.id,
    timestamp: start.ts,
    method: start.method,
    url: start.url,
    source: start.source ?? 'xhr',
    ...(start.headers !== undefined ? { requestHeaders: start.headers } : {}),
    ...(start.body !== undefined ? { requestBody: start.body } : {}),
    state: 'pending' as const,
    ...(screen !== undefined ? { screen } : {}),
    toCurl: () => formatCurl(captured),
  };
}

/** Build the patch applied to an entry when its end event arrives. */
export function buildEndPatch(end: HttpEventEnd): NetworkLogPatch {
  // A cancelled request carries an error object (the abort reason) but is not a
  // failure — it gets its own terminal state and keeps the reason as `error`
  // text for the detail view, without being treated as an error elsewhere.
  const state: NetworkLogEntry['state'] =
    end.cancelled === true ? 'cancelled' : end.error !== undefined ? 'error' : 'success';
  return {
    ...(end.status !== undefined ? { statusCode: end.status } : {}),
    durationMs: end.durationMs,
    ...(end.responseHeaders !== undefined ? { responseHeaders: end.responseHeaders } : {}),
    ...(end.responseBody !== undefined ? { responseBody: end.responseBody } : {}),
    ...(end.error !== undefined ? { error: end.error.message } : {}),
    state,
  };
}

interface CurlSource {
  method: string;
  url: string;
  headers: Record<string, string> | undefined;
  body: unknown;
}

function formatCurl(req: CurlSource): string {
  const parts: string[] = [`curl -X ${req.method}`];
  if (req.headers) {
    for (const [k, v] of Object.entries(req.headers)) {
      parts.push(`  -H '${k}: ${v}'`);
    }
  }
  if (req.body !== undefined) {
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    parts.push(`  -d '${raw.replace(/'/g, "'\\''")}'`);
  }
  parts.push(`  '${req.url}'`);
  return parts.join(' \\\n');
}
