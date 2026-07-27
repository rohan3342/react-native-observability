import type { HttpObserver, MockEngine } from '../../integrations/http';

/** Options for {@link observeFetch}. */
export interface ObserveFetchOptions {
  /**
   * A network mock engine. When provided, requests matching an active rule are
   * short-circuited — blocked (rejected) or answered with a synthetic
   * `Response` — instead of hitting the network. Dev-only unless the engine was
   * created with `allowInProduction`. See `createMockEngine`.
   */
  mock?: MockEngine;
  /**
   * Capture response bodies for the listed content-types. Only matching
   * responses are `.clone()`d and read; others record `responseBody: undefined`.
   *
   * Capturing arbitrary response bodies would force every response through a
   * `.clone() + .text()` round-trip even when the consumer never reads it,
   * doubling memory pressure and risking issues with large binary downloads.
   *
   * Default: `['application/json']`. Pass `[]` to never capture response bodies.
   *
   * Matching is a substring check against the response's `Content-Type` header
   * (case-insensitive), so `'application/json'` also matches
   * `'application/json; charset=utf-8'`.
   */
  responseBodyContentTypes?: string[];
}

const DEFAULT_BODY_TYPES = ['application/json'];

let idCounter = 0;
function generateId(): string {
  return `fetch-${Date.now()}-${(++idCounter).toString(36)}`;
}

// `RequestInfo` is a DOM type alias for `string | Request`; expanded here to
// avoid a DOM-lib dependency in the DTS build (tsup isolated worker).
interface FetchLike {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}

/**
 * Extracts a header object from anything `fetch` accepts (`Headers`, plain
 * object, array of tuples, or undefined).
 */
// `headers`/`body` are typed `unknown` rather than the DOM `HeadersInit`/
// `BodyInit`: the DOM and React Native `fetch` lib types disagree on those
// shapes (`HeadersInit_`, `BodyInit_`, `_SourceUri`), and which one is ambient
// depends on the build/test setup. These helpers narrow at runtime, so `unknown`
// is both portable and accurate for whatever the host's real `fetch` passes.
function normaliseHeaders(headers: unknown): Record<string, string> | undefined {
  if (headers === undefined || headers === null) return undefined;
  const out: Record<string, string> = {};
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    headers.forEach((value: string, key: string) => {
      out[key] = value;
    });
  } else if (Array.isArray(headers)) {
    for (const entry of headers) {
      if (Array.isArray(entry) && entry.length >= 2) {
        out[String(entry[0])] = String(entry[1]);
      }
    }
  } else if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      out[k] = String(v);
    }
  }
  return Object.keys(out).length === 0 ? undefined : out;
}

/** Reads `Response.headers` into a plain object. */
function readResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value: string, key: string) => {
    out[key] = value;
  });
  return out;
}

/**
 * Captures the request body when it is something safe to record as-is.
 *
 * Strings (the common JSON body case) are returned. Anything else — `Blob`,
 * `FormData`, `URLSearchParams`, `ArrayBuffer`, `ReadableStream` — would
 * require consuming the body and re-creating it, which can break `fetch`.
 * Those cases return `undefined`.
 */
function captureRequestBody(body: unknown): unknown {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
  return undefined;
}

/**
 * Builds a synthetic `Response` for a mock `respond` rule. Uses the global
 * `Response` (present in RN + web) when available so the consumer's
 * `.json()`/`.text()`/`.status` all work; falls back to a minimal duck-typed
 * object on a runtime without it.
 */
function makeMockResponse(
  status: number,
  body: unknown,
  headers: Record<string, string>
): Response {
  const text = typeof body === 'string' ? body : body === undefined ? '' : JSON.stringify(body);
  if (typeof Response !== 'undefined') {
    return new Response(text, { status, headers });
  }
  // Minimal fallback (no global Response — e.g. some test runtimes).
  const fake = {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? headers[k] ?? null },
    text: () => Promise.resolve(text),
    json: () => Promise.resolve(body),
    clone() {
      return fake;
    },
  };
  return fake as unknown as Response;
}

function shouldReadResponseBody(contentType: string | null, allow: string[]): boolean {
  if (allow.length === 0 || contentType === null) return false;
  const lower = contentType.toLowerCase();
  return allow.some(t => lower.includes(t.toLowerCase()));
}

/**
 * Monkey-patches `globalThis.fetch` to feed events into an existing
 * {@link HttpObserver}.
 *
 * Every fetch call is captured:
 * - Request: method, URL, headers, body (when the body is a string)
 * - Response: status, headers, body (when content-type matches
 *   `responseBodyContentTypes`)
 * - Errors: forwarded to `onEnd({ error })` and re-thrown unchanged
 *
 * Response body capture uses `Response.clone()` so the consumer's
 * `await response.json()` continues to work.
 *
 * **Restore order:** If multiple libraries wrap `globalThis.fetch`, the
 * `restore()` callback assumes it is called in inverse-install order. Failing
 * to do so will leave a foreign wrapper in place. Same constraint Sentry's
 * fetch instrumentation has — document this in the host app's teardown.
 *
 * @returns Cleanup function that reinstalls the previously-installed fetch.
 *
 * @example
 * ```ts
 * import { createHttpObserver } from 'react-native-observability';
 * import { observeFetch } from 'react-native-observability/observers/fetch';
 *
 * const http = createHttpObserver({ logger });
 * const restoreFetch = observeFetch(http);
 * // later, on teardown:
 * restoreFetch();
 * ```
 */
export function observeFetch(http: HttpObserver, opts: ObserveFetchOptions = {}): () => void {
  const allowedTypes = opts.responseBodyContentTypes ?? DEFAULT_BODY_TYPES;
  const mock = opts.mock;
  const original = globalThis.fetch as FetchLike | undefined;
  if (original === undefined) {
    return () => {};
  }

  const wrapped: FetchLike = async (input, init) => {
    const id = generateId();
    const ts = Date.now();

    // Resolve URL and method without consuming a Request body
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const headers = normaliseHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    );
    const body = captureRequestBody(init?.body);

    http.onStart({
      id,
      ts,
      method,
      url,
      source: 'fetch',
      ...(headers !== undefined ? { headers } : {}),
      ...(body !== undefined ? { body } : {}),
    });

    // ── Request-phase mock interception ──────────────────────────────────────
    // A matching rule may block, answer synthetically, inject a fault, or modify
    // the outgoing request before it is sent. `effectiveInput`/`effectiveInit`
    // start as the caller's args and are rewritten by a `modifyRequest` rule.
    let effectiveInput = input;
    let effectiveInit = init;
    const resolution =
      mock?.resolve({ method, url, ...(headers ? { headers } : {}), body }) ?? null;
    if (resolution !== null) {
      if (resolution.type !== 'block' && resolution.delayMs > 0) {
        await new Promise<void>(r => setTimeout(r, resolution.delayMs));
      }
      if (resolution.type === 'block') {
        const err = new Error(
          `[observability] request blocked by mock rule "${resolution.rule.id}"`
        );
        http.onEnd({ id, durationMs: Date.now() - ts, error: err });
        throw err;
      }
      if (resolution.type === 'fault') {
        // `delayMs` (for timeout) was already awaited above. Then fail.
        const err = new Error(
          `[observability] ${resolution.kind} injected by mock rule "${resolution.rule.id}"`
        );
        http.onEnd({ id, durationMs: Date.now() - ts, error: err });
        throw err;
      }
      if (resolution.type === 'respond') {
        const synthetic = makeMockResponse(resolution.status, resolution.body, resolution.headers);
        http.onEnd({
          id,
          durationMs: Date.now() - ts,
          status: resolution.status,
          responseHeaders: resolution.headers,
          ...(resolution.body !== undefined ? { responseBody: resolution.body } : {}),
        });
        return synthetic;
      }
      // modifyRequest — rebuild the fetch args from the mutated request and fall
      // through to the real network call.
      const m = resolution.request;
      effectiveInput = m.url;
      // Serialize a non-string body — `fetch` stringifies an object to the literal
      // "[object Object]" on the wire, so JSON-encode it (and default a JSON
      // Content-Type when the rule didn't set one). (Audit API-3.)
      // Both branches below produce a string, so use `string` rather than
      // the DOM-lib `BodyInit` union (which isn't available without the DOM lib).
      let modifiedBody: string | undefined;
      let modifiedHeaders = m.headers;
      if (m.body !== undefined) {
        if (typeof m.body === 'string') {
          modifiedBody = m.body;
        } else {
          modifiedBody = JSON.stringify(m.body);
          const hasContentType =
            modifiedHeaders !== undefined &&
            Object.keys(modifiedHeaders).some(k => k.toLowerCase() === 'content-type');
          if (!hasContentType) {
            modifiedHeaders = { ...(modifiedHeaders ?? {}), 'Content-Type': 'application/json' };
          }
        }
      }
      // Cast init through Record<string, unknown> before spreading to avoid
      // exactOptionalPropertyTypes conflicts between the DOM and React Native
      // global RequestInit augmentations (see note at normaliseHeaders above).
      // The cast is safe: init is a real RequestInit at runtime and we only
      // override documented keys (method, headers, body).
      effectiveInit = {
        ...(init as Record<string, unknown>),
        method: m.method,
        ...(modifiedHeaders !== undefined ? { headers: modifiedHeaders } : {}),
        ...(modifiedBody !== undefined ? { body: modifiedBody } : {}),
      } as RequestInit;
    }

    try {
      const response = await original(effectiveInput, effectiveInit);

      const responseHeaders = readResponseHeaders(response.headers);
      let responseBody: unknown;
      if (shouldReadResponseBody(response.headers.get('Content-Type'), allowedTypes)) {
        // Clone so the consumer's .json()/.text() still works
        try {
          const text = await response.clone().text();
          try {
            responseBody = JSON.parse(text) as unknown;
          } catch {
            responseBody = text;
          }
        } catch {
          responseBody = undefined;
        }
      }

      // ── Response-phase mock interception ───────────────────────────────────
      // A `modifyResponse` rule overrides the real status/headers/body before
      // the app sees it.
      const respMod =
        mock?.resolveResponse(
          { method, url },
          {
            status: response.status,
            ...(responseHeaders !== undefined ? { headers: responseHeaders } : {}),
            body: responseBody,
          }
        ) ?? null;
      if (respMod !== null) {
        if (respMod.delayMs > 0) await new Promise<void>(r => setTimeout(r, respMod.delayMs));
        const synthetic = makeMockResponse(respMod.status, respMod.body, respMod.headers);
        http.onEnd({
          id,
          durationMs: Date.now() - ts,
          status: respMod.status,
          responseHeaders: respMod.headers,
          ...(respMod.body !== undefined ? { responseBody: respMod.body } : {}),
        });
        return synthetic;
      }

      http.onEnd({
        id,
        durationMs: Date.now() - ts,
        status: response.status,
        responseHeaders,
        ...(responseBody !== undefined ? { responseBody } : {}),
      });
      return response;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // An aborted fetch rejects with an AbortError (DOMException name) — record
      // it as a cancellation, not a failure, so it isn't logged at error level
      // (audit API-2).
      const cancelled = error.name === 'AbortError';
      http.onEnd({
        id,
        durationMs: Date.now() - ts,
        error,
        ...(cancelled ? { cancelled: true } : {}),
      });
      throw err;
    }
  };

  globalThis.fetch = wrapped as typeof globalThis.fetch;

  return () => {
    // Restore only when the current fetch is still our wrapper — otherwise
    // someone installed on top and we'd clobber theirs.
    if (globalThis.fetch === (wrapped as typeof globalThis.fetch)) {
      globalThis.fetch = original as typeof globalThis.fetch;
    }
  };
}
