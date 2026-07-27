/**
 * Provider-agnostic network mock engine (plan S15 advanced network options).
 *
 * Holds an ordered list of **rules** that intercept HTTP traffic in two phases —
 * like Proxyman/Charles, on device:
 *
 * **Request phase** (`resolve()`, before the request is sent): `block`,
 * `respond` (canned answer), `modifyRequest` (mutate method/url/headers/body
 * then proceed), or `fault` (inject a network error / timeout, optionally only
 * every Nth match).
 *
 * **Response phase** (`resolveResponse()`, after the real response returns):
 * `modifyResponse` (override status/headers/body before the app sees it).
 *
 * Vendor shims (`observeAxios`, `observeFetch`) call `resolve()` before issuing
 * the request and `resolveResponse()` after it completes. The engine knows
 * nothing about any HTTP client.
 *
 * **Safety:** mocking is **dev-only by default** — `resolve()` returns `null`
 * (no interception) in production unless the engine was explicitly constructed
 * with `allowInProduction: true`, which also emits a loud one-time warning.
 * Shipping a mock to real users is exactly the failure this guards against.
 */

/** A single matcher + action. */
export interface MockRule {
  /** Stable id (for the panel's edit/delete/reorder). */
  readonly id: string;
  /** Inactive rules are skipped by `resolve()`. Default treated as enabled. */
  readonly enabled?: boolean;
  /** Match criteria. An omitted field matches anything. */
  readonly match: {
    /** HTTP method, case-insensitive. Omit to match any method. */
    readonly method?: string;
    /**
     * URL pattern. A plain string is a case-insensitive **substring** match; a
     * `RegExp` is tested against the full URL; a string containing `*` is
     * treated as a glob (`*` = any run of non-slash, `**` = any run).
     */
    readonly url?: string | RegExp;
  };
  /** What to do when this rule matches. */
  readonly action: MockAction;
}

/** A patch applied to a header map: keys to set/replace, plus keys to remove. */
export interface HeaderPatch {
  /** Headers to set or overwrite. */
  readonly set?: Record<string, string>;
  /** Header names to remove (case-insensitive). */
  readonly remove?: readonly string[];
}

/** Fault kinds a rule can inject (see `fault` action). */
export type MockFaultKind = 'networkError' | 'timeout';

/**
 * What a rule does when it matches. Five kinds, across two interception phases:
 *
 * **Request phase** (before the request goes out, via `resolve()`):
 * - `block` — fail the request with a synthetic network error.
 * - `respond` — answer with a canned status/body/headers, skipping the network.
 * - `modifyRequest` — mutate the outgoing method/url/headers/body, then proceed
 *   to the real network.
 * - `fault` — inject a failure (network error or timeout), optionally only on
 *   every Nth match.
 *
 * **Response phase** (after the real response returns, via `resolveResponse()`):
 * - `modifyResponse` — override the real status/headers/body before the app
 *   sees it.
 */
export type MockAction =
  | { readonly type: 'block' }
  | {
      readonly type: 'respond';
      /** Status code. Default `200`. */
      readonly status?: number;
      /** Response body (object → JSON, string → as-is). */
      readonly body?: unknown;
      /** Response headers. */
      readonly headers?: Record<string, string>;
      /** Artificial latency before the response resolves, in ms. Default `0`. */
      readonly delayMs?: number;
    }
  | {
      readonly type: 'modifyRequest';
      /** Override the HTTP method. */
      readonly method?: string;
      /** Rewrite the URL (full replacement). */
      readonly url?: string;
      /** Header set/remove patch. */
      readonly headers?: HeaderPatch;
      /** Replace the request body entirely. */
      readonly body?: unknown;
      /** Delay before the (real) request is dispatched, in ms. */
      readonly delayMs?: number;
    }
  | {
      readonly type: 'modifyResponse';
      /** Override the response status code. */
      readonly status?: number;
      /** Header set/remove patch applied to the real response headers. */
      readonly headers?: HeaderPatch;
      /** Replace the response body entirely. */
      readonly body?: unknown;
      /** Delay before the (modified) response resolves, in ms. */
      readonly delayMs?: number;
    }
  | {
      readonly type: 'fault';
      /** `networkError` rejects immediately; `timeout` hangs then fails. */
      readonly kind: MockFaultKind;
      /** For `timeout`: how long to hang before failing, in ms. Default `30000`. */
      readonly delayMs?: number;
      /**
       * Inject the fault only on every Nth match (1 = always, 3 = one in three).
       * Lets you test retry logic against intermittent failures. Default `1`.
       */
      readonly everyN?: number;
    };

/** The minimal request shape a shim hands the engine. */
export interface MockRequest {
  readonly method: string;
  readonly url: string;
  /** Outgoing headers, when the shim can provide them (for `modifyRequest`). */
  readonly headers?: Record<string, string>;
  /** Outgoing body, when available (for `modifyRequest`). */
  readonly body?: unknown;
}

/** The real response shape handed to `resolveResponse()` for the response phase. */
export interface MockResponse {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: unknown;
}

/**
 * The engine's request-phase decision. `null` from `resolve()` means "no
 * interception — perform the real request" (but a `modifyResponse` rule may
 * still act later via {@link MockEngine.resolveResponse}).
 */
export type MockResolution =
  | { readonly type: 'block'; readonly rule: MockRule }
  | {
      readonly type: 'respond';
      readonly rule: MockRule;
      readonly status: number;
      readonly body: unknown;
      readonly headers: Record<string, string>;
      readonly delayMs: number;
    }
  | {
      readonly type: 'modifyRequest';
      readonly rule: MockRule;
      /** The mutated request the shim should actually send. */
      readonly request: Required<Pick<MockRequest, 'method' | 'url'>> & {
        readonly headers?: Record<string, string>;
        readonly body?: unknown;
      };
      readonly delayMs: number;
    }
  | {
      readonly type: 'fault';
      readonly rule: MockRule;
      readonly kind: MockFaultKind;
      readonly delayMs: number;
    };

/** The engine's response-phase decision (from {@link MockEngine.resolveResponse}). */
export type MockResponseResolution = {
  readonly type: 'modifyResponse';
  readonly rule: MockRule;
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: unknown;
  readonly delayMs: number;
};

/** Options for {@link createMockEngine}. */
export interface CreateMockEngineOptions {
  /** Seed rules. Default: none. */
  readonly rules?: readonly MockRule[];
  /**
   * Permit mocking in production builds. **Off by default** — a production mock
   * silently breaks real users. Turning it on emits a loud warning.
   */
  readonly allowInProduction?: boolean;
}

/** The mock engine returned by {@link createMockEngine}. */
export interface MockEngine {
  /**
   * Request-phase: resolve a request against the active rules before it is sent.
   * Returns the first matching rule's resolution (`block` / `respond` /
   * `modifyRequest` / `fault`), or `null` for "no request-phase interception —
   * perform the real request". A `modifyResponse` rule is **not** returned here;
   * it acts later via {@link resolveResponse}. Always `null` in production
   * unless `allowInProduction` was set.
   */
  resolve(request: MockRequest): MockResolution | null;
  /**
   * Response-phase: after the real request completes, resolve the response
   * against `modifyResponse` rules. Returns the transformed response, or `null`
   * for "no change". Always `null` in production unless `allowInProduction`.
   */
  resolveResponse(request: MockRequest, response: MockResponse): MockResponseResolution | null;
  /** Current rules (a copy). */
  getRules(): MockRule[];
  /** Replace the entire rule list. */
  setRules(rules: readonly MockRule[]): void;
  /** Append a rule. */
  addRule(rule: MockRule): void;
  /** Remove a rule by id. */
  removeRule(id: string): void;
  /** Patch a rule by id (shallow-merge). No-op if the id is unknown. */
  updateRule(id: string, patch: Partial<MockRule>): void;
  /** Whether interception is currently possible (dev, or prod-allowed). */
  readonly active: boolean;
}

/** Glob → RegExp: `**` = any run, `*` = any run of non-slash. */
export function globToRegExp(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i++;
      } else {
        out += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return new RegExp(out, 'i');
}

/**
 * Test whether a URL matches a pattern, using the same rules as the engine's
 * request matching. Exported as a pure helper so editor UI (e.g. the rule
 * tester) can preview matches without instantiating an engine.
 *
 * - `undefined` → matches any URL.
 * - `RegExp` → tested against the full URL.
 * - A string containing `*` → treated as a glob (`*` = any non-slash, `**` = any).
 * - Any other string → case-insensitive substring match.
 */
export function matchesUrlPattern(pattern: string | RegExp | undefined, url: string): boolean {
  if (pattern === undefined) return true;
  if (pattern instanceof RegExp) return pattern.test(url);
  if (pattern.includes('*')) return globToRegExp(pattern).test(url);
  return url.toLowerCase().includes(pattern.toLowerCase());
}

function urlMatches(pattern: string | RegExp | undefined, url: string): boolean {
  return matchesUrlPattern(pattern, url);
}

function ruleMatches(rule: MockRule, req: MockRequest): boolean {
  if (rule.enabled === false) return false;
  if (
    rule.match.method !== undefined &&
    rule.match.method.toUpperCase() !== req.method.toUpperCase()
  )
    return false;
  return urlMatches(rule.match.url, req.url);
}

/** Apply a {@link HeaderPatch} to a header map, returning a new object. */
function applyHeaderPatch(
  headers: Record<string, string> | undefined,
  patch: HeaderPatch | undefined
): Record<string, string> {
  const out: Record<string, string> = { ...(headers ?? {}) };
  if (patch === undefined) return out;
  if (patch.remove !== undefined) {
    const removeLower = patch.remove.map(k => k.toLowerCase());
    for (const key of Object.keys(out)) {
      if (removeLower.includes(key.toLowerCase())) delete out[key];
    }
  }
  if (patch.set !== undefined) Object.assign(out, patch.set);
  return out;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Creates a {@link MockEngine}. See the module doc for the safety model.
 *
 * @example
 * ```ts
 * import { createMockEngine } from 'react-native-observability';
 *
 * const mock = createMockEngine({
 *   rules: [
 *     { id: 'flaky', match: { url: '/api/orders' }, action: { type: 'respond', status: 500, delayMs: 800, body: { error: 'boom' } } },
 *     { id: 'ads', match: { url: '**\/ads/**' }, action: { type: 'block' } },
 *   ],
 * });
 * observeAxios(client, http, { mock });   // shim short-circuits matched requests
 * ```
 *
 * @stability experimental
 */
export function createMockEngine(opts: CreateMockEngineOptions = {}): MockEngine {
  let rules: MockRule[] = [...(opts.rules ?? [])];
  // Per-rule match counter, for `fault.everyN` intermittent injection.
  const matchCount = new Map<string, number>();

  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
  const allowProd = opts.allowInProduction === true;
  const active = isDev || allowProd;

  if (!isDev && allowProd) {
    // Loud, unconditional (not __DEV__-gated): a prod mock is dangerous.
    console.warn(
      '[observability] network mock engine is ACTIVE IN PRODUCTION (allowInProduction:true). ' +
        'Mocked requests will not hit the network for real users.'
    );
  }

  return {
    active,
    resolve(request) {
      if (!active) return null;
      // Request phase: first matching rule whose action acts pre-flight.
      // `modifyResponse` rules are response-phase and skipped here.
      const rule = rules.find(r => r.action.type !== 'modifyResponse' && ruleMatches(r, request));
      if (rule === undefined) return null;
      const action = rule.action;

      if (action.type === 'block') return { type: 'block', rule };

      if (action.type === 'respond') {
        return {
          type: 'respond',
          rule,
          status: action.status ?? 200,
          body: action.body,
          headers: action.headers ?? {},
          delayMs: action.delayMs ?? 0,
        };
      }

      if (action.type === 'modifyRequest') {
        return {
          type: 'modifyRequest',
          rule,
          request: {
            method: action.method ?? request.method,
            url: action.url ?? request.url,
            headers: applyHeaderPatch(request.headers, action.headers),
            body: 'body' in action ? action.body : request.body,
          },
          delayMs: action.delayMs ?? 0,
        };
      }

      // fault — honour everyN so only every Nth match injects the failure.
      // (`resolve` already filtered out `modifyResponse`; this is the only
      // remaining action type, but narrow explicitly for the type checker.)
      if (action.type !== 'fault') return null;
      const everyN = Math.max(1, action.everyN ?? 1);
      const n = (matchCount.get(rule.id) ?? 0) + 1;
      matchCount.set(rule.id, n);
      if (everyN > 1 && n % everyN !== 0) return null; // this call passes through
      return {
        type: 'fault',
        rule,
        kind: action.kind,
        delayMs: action.kind === 'timeout' ? (action.delayMs ?? DEFAULT_TIMEOUT_MS) : 0,
      };
    },
    resolveResponse(request, response) {
      if (!active) return null;
      const rule = rules.find(r => r.action.type === 'modifyResponse' && ruleMatches(r, request));
      if (rule === undefined || rule.action.type !== 'modifyResponse') return null;
      const action = rule.action;
      return {
        type: 'modifyResponse',
        rule,
        status: action.status ?? response.status,
        headers: applyHeaderPatch(response.headers, action.headers),
        body: 'body' in action ? action.body : response.body,
        delayMs: action.delayMs ?? 0,
      };
    },
    getRules: () => [...rules],
    setRules(next) {
      rules = [...next];
    },
    addRule(rule) {
      rules = [...rules, rule];
    },
    removeRule(id) {
      rules = rules.filter(r => r.id !== id);
      matchCount.delete(id); // reset fault counter so a re-added id starts fresh
    },
    updateRule(id, patch) {
      rules = rules.map(r => (r.id === id ? { ...r, ...patch } : r));
      matchCount.delete(id); // editing a rule resets its fault cadence
    },
  };
}
