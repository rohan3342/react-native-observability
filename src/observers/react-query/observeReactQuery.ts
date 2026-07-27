import type { Logger } from '../../logger/Logger';
import { trackAsyncOperation } from '../../integrations/asyncOp';

/** Minimal QueryCache event — the subset of `@tanstack/react-query` we read. */
interface QueryCacheEvent {
  type: string;
  query: {
    queryKey: unknown[];
    state: {
      status: string;
      error: unknown;
    };
  };
}

/** Minimal MutationCache event. */
interface MutationCacheEvent {
  type: string;
  mutation: {
    options: { mutationKey?: unknown[] };
    state: {
      status: string;
      error: unknown;
    };
  };
}

/** Minimal `QueryClient` interface — only what we subscribe to. */
interface MinimalQueryClient {
  getQueryCache(): {
    subscribe(callback: (event: QueryCacheEvent) => void): () => void;
  };
  getMutationCache?(): {
    subscribe(callback: (event: MutationCacheEvent) => void): () => void;
  };
}

/** Options for {@link observeReactQuery}. */
export interface ObserveReactQueryOptions {
  /** Logger forwarded to `trackAsyncOperation`. Required for any output. */
  logger?: Logger;
  /** Optional namespace prepended to async-op telemetry. */
  namespace?: string;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Subscribes to a `@tanstack/react-query` `QueryClient` and forwards
 * terminal-error events through `trackAsyncOperation(...).onError`.
 *
 * Covers both queries (`QueryCache`) and mutations (`MutationCache`).
 * Successful queries and mutations are NOT logged — `trackAsyncOperation`'s
 * `onSuccess` is currently a no-op per its contract, so calling it for every
 * successful query would add overhead with no observable effect.
 *
 * `queryClient` is typed as a minimal local interface so this module has no
 * hard compile-time dependency on `@tanstack/react-query`. Pass the real
 * client — TypeScript validates structurally.
 *
 * @returns Cleanup function that unsubscribes from both caches.
 *
 * @example
 * ```ts
 * import { QueryClient } from '@tanstack/react-query';
 * import { observeReactQuery } from 'react-native-observability/observers/react-query';
 *
 * const queryClient = new QueryClient();
 * const cleanup = observeReactQuery(queryClient, { logger });
 * ```
 */
export function observeReactQuery(
  queryClient: MinimalQueryClient,
  opts: ObserveReactQueryOptions = {}
): () => void {
  const baseOptions: Parameters<typeof trackAsyncOperation>[0] = {
    key: '', // overwritten per event
    ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
  };

  const unsubQuery = queryClient.getQueryCache().subscribe(event => {
    if (event.type !== 'updated' || event.query.state.status !== 'error') return;
    const op = trackAsyncOperation({
      ...baseOptions,
      key: `query:${JSON.stringify(event.query.queryKey)}`,
    });
    op.onError(toError(event.query.state.error));
  });

  const mutationCache = queryClient.getMutationCache?.();
  const unsubMutation = mutationCache
    ? mutationCache.subscribe(event => {
        if (event.type !== 'updated' || event.mutation.state.status !== 'error') return;
        const key =
          event.mutation.options.mutationKey !== undefined
            ? `mutation:${JSON.stringify(event.mutation.options.mutationKey)}`
            : 'mutation:<anonymous>';
        const op = trackAsyncOperation({ ...baseOptions, key });
        op.onError(toError(event.mutation.state.error));
      })
    : null;

  return () => {
    unsubQuery();
    unsubMutation?.();
  };
}
