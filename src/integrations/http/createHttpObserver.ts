import type { Logger } from '../../logger/Logger';
import { deepRedact, redactString, resolveRedactConfig } from '../../logger/redact/deepRedact';
import { touchScreenActivity } from '../screen';
import type { BreadcrumbStore } from '../breadcrumbs';
import {
  NetworkLogStore,
  buildEndPatch,
  buildPendingEntry,
  type NetworkLogEntry,
} from './NetworkLogStore';
import type { HttpEventEnd, HttpEventStart, HttpRedactOptions } from './types';

/**
 * The observer object returned by {@link createHttpObserver}.
 *
 * Vendor shims (axios, fetch, GraphQL clients, etc.) call `onStart` and
 * `onEnd` to feed events in. The shipped Network panel reads `store`.
 */
export interface HttpObserver {
  /** Called by a vendor shim when a request is dispatched. */
  onStart(event: HttpEventStart): void;
  /** Called by a vendor shim when a request resolves or rejects. */
  onEnd(event: HttpEventEnd): void;
  /** Backing store. The panel subscribes via `useSyncExternalStore`. */
  readonly store: NetworkLogStore;
}

/** Options for {@link createHttpObserver}. */
export interface CreateHttpObserverOptions {
  /**
   * Observability logger used to record end-of-request errors. When omitted no
   * log entry is created — events still land in `store`.
   */
  logger?: Logger;
  /**
   * Existing {@link NetworkLogStore} to write into. When omitted a new one
   * with the default capacity is constructed.
   */
  store?: NetworkLogStore;
  /** Header / body redaction config applied before storage. */
  redact?: HttpRedactOptions;
  /**
   * Optional function invoked once per request-start to tag the entry with the
   * currently-active screen. Wire it with `createScreenProvider()` (from
   * `react-native-observability`) to tie network logs to navigation. When omitted,
   * entries carry no `screen`.
   *
   * MUST be cheap (synchronous, no I/O) — `createScreenProvider()` is a single
   * store read.
   *
   * **Per-request override.** A vendor shim / interceptor may set `screen` on the
   * `HttpEventStart`: a string reassigns, `null` forces "no screen" (e.g. a
   * global token-refresh interceptor). The override wins over this provider.
   */
  screenProvider?: () => string | undefined;
  /**
   * Optional breadcrumb store (from `getBreadcrumbStore()`). When provided, every
   * completed request is recorded as a `network` breadcrumb in the timeline /
   * crash trail (T5-6). Omit to skip breadcrumb recording.
   */
  breadcrumbs?: BreadcrumbStore;
  /**
   * When `false` (default), the observer is a no-op in production builds.
   * Set `true` to capture in preprod/staging.
   */
  logInProduction?: boolean;
}

const DEFAULT_REPLACEMENT = '[REDACTED]';

/**
 * Header keys redacted by default — the common credential / session carriers.
 * For a security-positioned tool these must be scrubbed out of the box; the
 * consumer's `redact.headerKeys` extends this set, and `redact.headerKeys: []`
 * with `redactDefaultHeaders: false` opts out entirely. (Audit SEC-3.)
 */
const DEFAULT_SENSITIVE_HEADERS = [
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
] as const;

/**
 * Creates a provider-agnostic HTTP observer.
 *
 * The observer owns a {@link NetworkLogStore}, applies redaction, and is fed
 * events by one or more vendor-specific shims (axios, fetch, GraphQL, etc.).
 *
 * @example
 * ```ts
 * import { createHttpObserver } from 'react-native-observability';
 * import { observeAxios } from 'react-native-observability/observers/axios';
 *
 * const http = createHttpObserver({ logger, redact: { headerKeys: ['Authorization'] } });
 * const cleanup = observeAxios(axiosInstance, http);
 * ```
 */
export function createHttpObserver(opts: CreateHttpObserverOptions = {}): HttpObserver {
  const store = opts.store ?? new NetworkLogStore();
  const replacement = opts.redact?.replacement ?? DEFAULT_REPLACEMENT;
  // Default-on sensitive-header redaction (SEC-3), unless explicitly opted out.
  // Consumer keys extend the built-in set; dedupe so the match list stays small.
  const baseHeaders =
    opts.redact?.redactDefaultHeaders === false ? [] : [...DEFAULT_SENSITIVE_HEADERS];
  const headerKeysLower = [
    ...new Set([...baseHeaders, ...(opts.redact?.headerKeys ?? []).map(k => k.toLowerCase())]),
  ];

  // Bodies go through the shared deep-redact engine: the configured `bodyKeys`
  // become glob keys that match at ANY nesting depth (`**.<key>`), and the
  // default-on email / JWT / credit-card value patterns scrub PII even from
  // keys the consumer didn't list. Disable a pattern via
  // `redact.valuePatterns.<name> = false`. (Fixes the v1 shallow-body leak, B3.)
  const bodyKeyGlobs = (opts.redact?.bodyKeys ?? []).flatMap(k => [k, `**.${k}`]);
  const bodyRedact = resolveRedactConfig({
    keys: bodyKeyGlobs,
    replacement,
    ...(opts.redact?.valuePatterns !== undefined
      ? { valuePatterns: opts.redact.valuePatterns }
      : {}),
  });

  // Resolve dev-mode + production gating once at construction so the hot
  // path is a single boolean read.
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  const enabled = isDev || (opts.logInProduction ?? false);

  function redactHeaders(headers: Record<string, string>): Record<string, string> {
    if (headerKeysLower.length === 0) return headers;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      out[k] = headerKeysLower.includes(k.toLowerCase()) ? replacement : v;
    }
    return out;
  }

  function redactBody(body: unknown): unknown {
    // String bodies (form-encoded, XML, plaintext, or JSON we couldn't pre-parse)
    // must still be scrubbed — value patterns (email/JWT/CC) catch PII that would
    // otherwise be stored verbatim and reproduced in toCurl(). Try to parse JSON
    // so bodyKey globs apply to structured payloads; fall back to string scrubbing.
    if (typeof body === 'string') {
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed !== null && typeof parsed === 'object') {
          return JSON.stringify(deepRedact(parsed as Record<string, unknown>, bodyRedact));
        }
      } catch {
        // Not JSON — scrub the raw string with value patterns below.
      }
      return redactString(body, bodyRedact);
    }
    if (typeof body !== 'object' || body === null) return body;
    return deepRedact(body as Record<string, unknown>, bodyRedact);
  }

  function onStart(event: HttpEventStart): void {
    if (!enabled) return;
    const redacted: HttpEventStart = {
      ...event,
      ...(event.headers !== undefined ? { headers: redactHeaders(event.headers) } : {}),
      ...(event.body !== undefined ? { body: redactBody(event.body) } : {}),
    };

    // Screen attribution. An explicit `event.screen` wins over the ambient
    // provider: a string reassigns, `null` forces "no screen" (global/background
    // calls). When absent, resolve from the ambient provider's idle window.
    let screen: string | undefined;
    if (event.screen === null) {
      screen = undefined;
    } else if (typeof event.screen === 'string') {
      screen = event.screen;
    } else {
      try {
        // Resolve FIRST (against prior activity) so an idle-time background call
        // correctly resolves to `undefined` and stays untagged. Only if a screen
        // was actually active do we extend the window — so an in-flight burst
        // keeps the screen alive for the next call (Sentry-style idle-extend),
        // while idle background calls never self-extend.
        screen = opts.screenProvider?.();
        if (screen !== undefined) touchScreenActivity(event.ts);
      } catch {
        // Provider must never crash the observer — fall back to undefined
        screen = undefined;
      }
    }
    const entry: NetworkLogEntry = buildPendingEntry(redacted, screen);
    store.add(entry);
  }

  function onEnd(event: HttpEventEnd): void {
    if (!enabled) return;
    const redacted: HttpEventEnd = {
      ...event,
      ...(event.responseHeaders !== undefined
        ? { responseHeaders: redactHeaders(event.responseHeaders) }
        : {}),
      ...(event.responseBody !== undefined ? { responseBody: redactBody(event.responseBody) } : {}),
    };
    store.update(event.id, buildEndPatch(redacted));
    // A cancelled request is not a failure — don't emit an error-level log.
    const cancelled = event.cancelled === true;
    if (event.error !== undefined && !cancelled && opts.logger !== undefined) {
      opts.logger.error('HTTP error', event.error, { httpId: event.id });
    }

    // Network breadcrumb (T5-6) — record the completed request into the timeline.
    if (opts.breadcrumbs !== undefined) {
      const done = store.getSnapshot().find(e => e.id === event.id);
      if (done !== undefined) {
        const isError = event.error !== undefined && !cancelled;
        const status = cancelled
          ? 'cancelled'
          : isError
            ? 'error'
            : (event.status ?? done.statusCode);
        opts.breadcrumbs.record({
          timestamp: Date.now(),
          kind: 'network',
          level: isError || (event.status ?? 0) >= 400 ? 'error' : 'info',
          message: `${done.method} ${done.url} → ${status}`,
          category: done.method,
          ...(done.screen !== undefined ? { data: { screen: done.screen } } : {}),
        });
      }
    }
  }

  return { onStart, onEnd, store };
}
