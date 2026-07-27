import type { HttpObserver, MockEngine } from '../../integrations/http';

/** Optional extras for {@link observeAxios}. */
export interface ObserveAxiosOptions {
  /**
   * A network mock engine. When provided, requests matching an active rule are
   * short-circuited — blocked (rejected with a network error) or answered with
   * a synthetic response — instead of hitting the network. Dev-only unless the
   * engine was created with `allowInProduction`. See `createMockEngine`.
   */
  readonly mock?: MockEngine;
}

/**
 * Minimal Axios request config we read at runtime — avoids a hard compile-time
 * dep on `axios`. Every field is optional and weakly typed so the real
 * `InternalAxiosRequestConfig<any>` is assignable to this shape structurally.
 */
interface MinimalAxiosRequestConfig {
  method?: string;
  url?: string;
  baseURL?: string;
  params?: unknown;
  data?: unknown;
  // `unknown` rather than `Record<string, string>` because real Axios uses
  // `AxiosRequestHeaders`, a tagged class. We coerce at the read site.
  headers?: unknown;
  /**
   * Per-request adapter. Axios lets a request override the transport; we set it
   * to a function that returns a synthetic response when a mock rule matches,
   * which is the version-stable way to short-circuit without touching the
   * network. Left untouched otherwise.
   */
  adapter?: (config: MinimalAxiosRequestConfig) => Promise<MinimalAxiosResponse>;
}

interface MinimalAxiosResponse {
  status: number;
  data: unknown;
  config: MinimalAxiosRequestConfig;
  headers?: unknown;
}

interface MinimalAxiosError {
  message: string;
  config?: MinimalAxiosRequestConfig;
  response?: { status: number; headers?: unknown };
  /** Axios error code — `'ERR_CANCELED'` when the request was cancelled. */
  code?: string;
}

/**
 * The interceptor surface this shim needs. Typed with `unknown`-returning
 * callbacks so a real `AxiosInstance` (whose interceptor signatures are
 * richer and class-typed) is assignable structurally without forcing the
 * consumer to cast at the call site.
 *
 * The interceptor callbacks pass the config / response through unchanged at
 * runtime — we only read fields. The `unknown` return types are coerced to
 * the runtime value via a single internal cast.
 */
interface MinimalAxiosInstance {
  interceptors: {
    request: {
      use(onFulfilled: (config: MinimalAxiosRequestConfig) => unknown): number;
      eject(id: number): void;
    };
    response: {
      use(
        onFulfilled: (res: MinimalAxiosResponse) => unknown,
        onRejected: (err: MinimalAxiosError) => unknown
      ): number;
      eject(id: number): void;
    };
  };
}

/**
 * Public-facing parameter type for {@link observeAxios}. Accepts any object
 * whose `interceptors.request` and `interceptors.response` expose a `use` and
 * `eject` callable — broad enough that the real `AxiosInstance` from `axios`
 * is assignable without a cast at the call site.
 *
 * The `any` callback parameter is the documented escape hatch: real Axios
 * uses tagged class types for its interceptors that defeat structural
 * subtyping. We pay one `any` here at the public boundary so consumers do
 * not pay one at every call site.
 */
export interface AxiosLike {
  interceptors: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request: { use: (onFulfilled: any) => number; eject: (id: number) => void };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response: { use: (onFulfilled: any, onRejected?: any) => number; eject: (id: number) => void };
  };
}

/** Reads `unknown` headers as a plain `Record<string, string>` when possible. */
function readHeaders(headers: unknown): Record<string, string> | undefined {
  if (headers === undefined || headers === null) return undefined;
  if (typeof headers !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v;
    else if (v !== undefined && v !== null) out[k] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Correlation between request and response interceptors lives on a `WeakMap`
 * keyed by the request config object. This avoids mutating the config (no
 * `__observabilityId` stamping like v1) and lets the GC clean up dangling entries
 * when a config object is dropped without a response.
 */
const pending = new WeakMap<MinimalAxiosRequestConfig, { id: string; ts: number }>();

let idCounter = 0;
function generateId(): string {
  return `axios-${Date.now()}-${(++idCounter).toString(36)}`;
}

function buildUrl(config: MinimalAxiosRequestConfig): string {
  const base = config.baseURL ?? '';
  const path = config.url ?? '';
  const combined = base + path;
  if (config.params === undefined || config.params === null) return combined;
  try {
    const qs = new URLSearchParams(config.params as Record<string, string>).toString();
    return qs ? `${combined}?${qs}` : combined;
  } catch {
    return combined;
  }
}

function safeParseBody(data: unknown): unknown {
  if (typeof data !== 'string') return data;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return data;
  }
}

/**
 * Installs Axios request and response interceptors that feed an existing
 * {@link HttpObserver} created via `createHttpObserver(...)`.
 *
 * The observer owns the store and the redaction logic; this shim is only a
 * translator from Axios events to `HttpObserver.onStart` / `onEnd`.
 *
 * @returns Cleanup function — call to eject the interceptors.
 *
 * @example
 * ```ts
 * import { createHttpObserver } from 'react-native-observability';
 * import { observeAxios } from 'react-native-observability/observers/axios';
 *
 * const http = createHttpObserver({ logger });
 * const cleanup = observeAxios(axiosInstance, http);
 * // later, on teardown:
 * cleanup();
 * ```
 */
export function observeAxios(
  instance: AxiosLike,
  http: HttpObserver,
  opts: ObserveAxiosOptions = {}
): () => void {
  // Cast once at the boundary. The real `AxiosInstance` is class-tagged in
  // ways that resist structural typing of the interceptor surface, so we
  // accept `AxiosLike` (containing the shape we read) and trust the consumer
  // is passing a real Axios instance at runtime.
  const inst = instance as unknown as MinimalAxiosInstance;
  const mock = opts.mock;
  const reqId = inst.interceptors.request.use(config => {
    const id = generateId();
    const ts = Date.now();
    pending.set(config, { id, ts });
    const headers = readHeaders(config.headers);
    const method = (config.method ?? 'GET').toUpperCase();
    const url = buildUrl(config);
    http.onStart({
      id,
      ts,
      method,
      url,
      source: 'xhr',
      ...(headers !== undefined ? { headers } : {}),
      ...(config.data !== undefined ? { body: safeParseBody(config.data) } : {}),
    });

    // Request-phase mock interception.
    const resolution =
      mock?.resolve({
        method,
        url,
        ...(headers !== undefined ? { headers } : {}),
        body: config.data,
      }) ?? null;
    if (resolution !== null) {
      if (resolution.type === 'modifyRequest') {
        // Mutate the outgoing config in place, then proceed to the real network.
        const m = resolution.request;
        config.method = m.method;
        config.url = m.url;
        if (m.headers !== undefined) config.headers = m.headers;
        if (m.body !== undefined) config.data = m.body;
      } else {
        // block / respond / fault — override the adapter to short-circuit the
        // network and resolve/reject synthetically.
        config.adapter = async (cfg: MinimalAxiosRequestConfig) => {
          if (resolution.type !== 'block' && resolution.delayMs > 0) {
            await new Promise<void>(r => setTimeout(r, resolution.delayMs));
          }
          if (resolution.type === 'block') {
            throw new Error(`[observability] request blocked by mock rule "${resolution.rule.id}"`);
          }
          if (resolution.type === 'fault') {
            throw new Error(
              `[observability] ${resolution.kind} injected by mock rule "${resolution.rule.id}"`
            );
          }
          return {
            status: resolution.status,
            data: resolution.body,
            config: cfg,
            headers: resolution.headers,
          };
        };
      }
    }
    return config;
  });

  const resId = inst.interceptors.response.use(
    response => {
      const meta = pending.get(response.config);

      // Response-phase mock interception: a `modifyResponse` rule overrides the
      // real status/headers/body before the caller's `.then` sees it.
      const cfg = response.config;
      const method = (cfg.method ?? 'GET').toUpperCase();
      const url = buildUrl(cfg);
      const respHeaders = readHeaders(response.headers);
      const respMod =
        mock?.resolveResponse(
          { method, url },
          {
            status: response.status,
            ...(respHeaders !== undefined ? { headers: respHeaders } : {}),
            body: response.data,
          }
        ) ?? null;
      if (respMod !== null) {
        response.status = respMod.status;
        response.data = respMod.body;
        response.headers = respMod.headers;
      }

      if (meta) {
        http.onEnd({
          id: meta.id,
          durationMs: Date.now() - meta.ts,
          status: response.status,
          responseHeaders: respMod !== null ? respMod.headers : (respHeaders ?? {}),
          responseBody: response.data,
        });
        pending.delete(response.config);
      }
      return response;
    },
    (err: MinimalAxiosError) => {
      if (err.config) {
        const meta = pending.get(err.config);
        if (meta) {
          const responseHeaders = readHeaders(err.response?.headers);
          // axios.isCancel sets code 'ERR_CANCELED' — record as a cancellation,
          // not an error, so it isn't logged at error level (audit API-2).
          const cancelled = err.code === 'ERR_CANCELED';
          http.onEnd({
            id: meta.id,
            durationMs: Date.now() - meta.ts,
            ...(err.response?.status !== undefined ? { status: err.response.status } : {}),
            ...(responseHeaders !== undefined ? { responseHeaders } : {}),
            error: new Error(err.message),
            ...(cancelled ? { cancelled: true } : {}),
          });
          pending.delete(err.config);
        }
      }
      return Promise.reject(err);
    }
  );

  return () => {
    inst.interceptors.request.eject(reqId);
    inst.interceptors.response.eject(resId);
  };
}
