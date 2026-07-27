/**
 * Provider-agnostic HTTP observation primitives.
 *
 * These types describe the contract that vendor-specific shims (axios, fetch,
 * apollo, urql, etc.) implement when they translate their library's events
 * into Observability's HTTP pipeline.
 */

/** Event emitted by a vendor shim when an HTTP request starts. */
export interface HttpEventStart {
  /** Vendor-generated correlation id; used to match this start to its end. */
  readonly id: string;
  /** Unix milliseconds (Date.now()) at the moment the request was issued. */
  readonly ts: number;
  /** HTTP method, e.g. `'GET'`, `'POST'`. */
  readonly method: string;
  /** Fully-resolved request URL (base + path + query). */
  readonly url: string;
  /** Request headers as a plain object. */
  readonly headers?: Record<string, string>;
  /** Request body — already parsed if the vendor parses JSON, else raw. */
  readonly body?: unknown;
  /**
   * Source classification used by panel sub-tab filtering.
   * Defaults to `'xhr'` when omitted by the shim.
   */
  readonly source?: 'xhr' | 'fetch' | 'graphql' | 'asset' | string;
  /**
   * Per-request screen override for attribution. A string reassigns the screen,
   * `null` forces "no screen" (e.g. a global interceptor's token-refresh call
   * that shouldn't be attributed to the mounted screen). When omitted, the
   * observer's ambient `screenProvider` resolves it. See
   * {@link CreateHttpObserverOptions.screenProvider}.
   */
  readonly screen?: string | null;
}

/** Event emitted by a vendor shim when an HTTP request completes. */
export interface HttpEventEnd {
  /** Correlation id matching a previous {@link HttpEventStart}. */
  readonly id: string;
  /** Milliseconds elapsed between start and end. */
  readonly durationMs: number;
  /** HTTP status code, when one was returned. */
  readonly status?: number;
  /** Response headers as a plain object. */
  readonly responseHeaders?: Record<string, string>;
  /** Response body — parsed when the vendor parses, else raw. */
  readonly responseBody?: unknown;
  /** Set when the request failed without a status (timeout, network error, etc.). */
  readonly error?: Error;
  /**
   * True when the request was **cancelled** by the caller (an aborted fetch /
   * `axios.isCancel`), not a genuine failure. A shim sets this so the observer
   * records a distinct `cancelled` state and does NOT emit an error-level log /
   * breadcrumb — routine cancellations (navigate-away, react-query cancellation,
   * debounced search) should not pollute the error stream. See audit API-2.
   */
  readonly cancelled?: boolean;
}

/** Header / body redaction options applied by {@link createHttpObserver}. */
export interface HttpRedactOptions {
  /**
   * Additional header keys whose values are replaced with `replacement`.
   * Case-insensitive, exact-key (headers are a flat string map). These **extend**
   * the default sensitive set (`authorization`, `proxy-authorization`, `cookie`,
   * `set-cookie`, `x-api-key`, `x-auth-token`) which is redacted out of the box.
   * @example ['x-session-id']
   */
  headerKeys?: string[];
  /**
   * Set `false` to disable the built-in default sensitive-header redaction and
   * scrub **only** the keys you list in `headerKeys`. Default `true` (audit SEC-3).
   */
  redactDefaultHeaders?: boolean;
  /**
   * Body keys (request and response) whose values are replaced. Matched at
   * **any nesting depth** — `bodyKeys: ['password']` also redacts
   * `body.user.password`. Case-sensitive on the key segment.
   * @example ['password', 'token']
   */
  bodyKeys?: string[];
  /**
   * Value-side redactors applied to every string in the body tree. Email / JWT
   * / credit-card are **ON by default**; pass `false` to disable one.
   * @example { email: false }
   */
  valuePatterns?: {
    email?: boolean;
    jwt?: boolean;
    creditCard?: boolean;
    custom?: RegExp[];
  };
  /** Replacement value. Default: `'[REDACTED]'`. */
  replacement?: string;
}
