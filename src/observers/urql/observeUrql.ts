import type { HttpObserver } from '../../integrations/http';

/**
 * Minimal shape of a urql `Operation`. Structurally satisfied by urql's
 * `Operation`; we read the integer `key` (urql's per-operation correlation id),
 * the `kind` (`'query'`/`'mutation'`/`'subscription'`), and the operation name
 * + variables from `context`/`variables`. We never import `urql`/`@urql/core`.
 */
interface UrqlOperationLike {
  key: number;
  kind: string;
  variables?: Record<string, unknown>;
  context?: { url?: string };
  query?: { definitions?: ReadonlyArray<{ name?: { value?: string } }> };
}

/** Minimal urql `OperationResult` — what `mapExchange.onResult` receives. */
interface UrqlResultLike {
  operation: UrqlOperationLike;
  data?: unknown;
  error?: unknown;
}

/**
 * The argument object urql's `mapExchange` accepts. `observeUrql` returns this;
 * pass it straight to `mapExchange(...)`. Typed structurally so this module has
 * no compile-time dependency on urql.
 */
export interface UrqlMapExchangeArg {
  onOperation: (operation: UrqlOperationLike) => void;
  onResult: (result: UrqlResultLike) => void;
}

/** Options for {@link observeUrql}. */
export interface ObserveUrqlOptions {
  /** Endpoint URL recorded when the operation context omits one. Default: `'graphql'`. */
  url?: string;
  /** Capture the response `data` payload. Default `false` (responses can be large / contain PII). */
  captureData?: boolean;
}

function operationName(op: UrqlOperationLike): string {
  return op.query?.definitions?.find(d => d.name?.value !== undefined)?.name?.value ?? 'anonymous';
}

/**
 * Builds the argument for urql's `mapExchange`, recording each operation as a
 * network event in the provider-agnostic {@link HttpObserver}. Operations are
 * correlated to their results by urql's integer `operation.key`, disambiguated
 * by name (`url#OperationName`) and tagged `source: 'graphql'`.
 *
 * Imports no urql code — the operation/result types are structural, and
 * `mapExchange` accepts the returned object directly.
 *
 * @example
 * ```ts
 * import { Client, cacheExchange, fetchExchange, mapExchange } from '@urql/core';
 * import { createHttpObserver } from 'react-native-observability';
 * import { observeUrql } from 'react-native-observability/observers/urql';
 *
 * const http = createHttpObserver({ logger });
 * const client = new Client({
 *   url,
 *   exchanges: [cacheExchange, mapExchange(observeUrql(http, { url })), fetchExchange],
 * });
 * ```
 *
 * @stability stable
 */
export function observeUrql(
  http: HttpObserver,
  options: ObserveUrqlOptions = {}
): UrqlMapExchangeArg {
  const fallbackUrl = options.url ?? 'graphql';
  const captureData = options.captureData ?? false;

  // urql guarantees onOperation precedes onResult for a given key; track starts
  // so durations are real. A 'teardown' operation has no result — its start is
  // simply never closed and is harmless (the entry stays open-ended).
  const starts = new Map<number, number>();

  return {
    onOperation(operation) {
      if (operation.kind === 'teardown') return;
      const ts = Date.now();
      starts.set(operation.key, ts);
      const name = operationName(operation);
      http.onStart({
        id: `urql-${operation.key}`,
        ts,
        source: 'graphql',
        method: operation.kind.toUpperCase(),
        url: `${operation.context?.url ?? fallbackUrl}#${name}`,
        ...(operation.variables !== undefined ? { body: operation.variables } : {}),
      });
    },
    onResult(result) {
      const key = result.operation.key;
      const ts = starts.get(key);
      if (ts === undefined) return; // no matching start (e.g. cache-only) — skip
      starts.delete(key);
      const isError = result.error !== undefined && result.error !== null;
      http.onEnd({
        id: `urql-${key}`,
        durationMs: Date.now() - ts,
        status: isError ? 0 : 200,
        ...(isError
          ? {
              error: result.error instanceof Error ? result.error : new Error(String(result.error)),
            }
          : {}),
        ...(captureData && !isError ? { responseBody: result.data } : {}),
      });
    },
  };
}
