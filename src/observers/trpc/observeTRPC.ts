import type { Logger } from '../../logger/Logger';
import { trackAsyncOperation } from '../../integrations/asyncOp';

/**
 * Minimal shape of a tRPC operation, structurally satisfied by tRPC v10/v11's
 * `Operation`. We read only `type` and `path`; we never import `@trpc/client`.
 */
interface TRPCOperationLike {
  readonly type: 'query' | 'mutation' | 'subscription' | string;
  readonly path: string;
}

/**
 * Minimal shape of a tRPC link's observable result. tRPC links return an
 * observable with a `subscribe({ next, error, complete })` method; we mirror the
 * subset we need without importing tRPC's `observable` helper.
 */
interface TRPCObservableLike<T> {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
  }): { unsubscribe(): void };
}

/**
 * The `op` argument tRPC hands a link's returned function. `next(op)` forwards
 * to the downstream link and returns its observable.
 */
interface TRPCLinkRuntime {
  readonly op: TRPCOperationLike;
  next(op: TRPCOperationLike): TRPCObservableLike<unknown>;
}

/**
 * A tRPC link: `(runtime) => (ctx) => observable`. Typed structurally so this
 * module has no compile-time dependency on `@trpc/client` — the real
 * `TRPCLink<Router>` assigns to it.
 */
export type ObserveTRPCLink = () => (runtime: TRPCLinkRuntime) => TRPCObservableLike<unknown>;

/** Options for {@link observeTRPC}. */
export interface ObserveTRPCOptions {
  /** Logger forwarded to `trackAsyncOperation`. Required for any output. */
  logger?: Logger;
  /** Optional namespace recorded on async-op telemetry. */
  namespace?: string;
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * Builds a tRPC **link** that reports each failed operation through
 * `trackAsyncOperation(...).onError`, so tRPC query/mutation/subscription
 * failures flow into the Observability pipeline. Place it **before** your
 * terminating link (`httpBatchLink` / `httpLink`) in the `links` array.
 *
 * Like every Observability observer, this imports no vendor SDK — the link is typed
 * structurally, and the real tRPC `TRPCLink` satisfies it.
 *
 * Successful operations are not logged (`trackAsyncOperation.onSuccess` is a
 * no-op by contract); only terminal errors are reported, keyed `trpc:<type>:<path>`.
 *
 * @example
 * ```ts
 * import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
 * import { observeTRPC } from 'react-native-observability/observers/trpc';
 *
 * const client = createTRPCProxyClient<AppRouter>({
 *   links: [observeTRPC({ logger }), httpBatchLink({ url })],
 * });
 * ```
 *
 * @stability stable
 */
export function observeTRPC(opts: ObserveTRPCOptions = {}): ObserveTRPCLink {
  const baseOptions: Parameters<typeof trackAsyncOperation>[0] = {
    key: '', // overwritten per operation
    ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
  };

  return () =>
    ({ op, next }) => {
      const downstream = next(op);
      return {
        subscribe(observer) {
          return downstream.subscribe({
            next: value => observer.next?.(value),
            error: err => {
              const handle = trackAsyncOperation({
                ...baseOptions,
                key: `trpc:${op.type}:${op.path}`,
              });
              handle.onError(toError(err));
              observer.error?.(err);
            },
            complete: () => observer.complete?.(),
          });
        },
      };
    };
}
