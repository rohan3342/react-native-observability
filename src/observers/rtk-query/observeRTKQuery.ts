import type { Logger } from '../../logger/Logger';
import { trackAsyncOperation } from '../../integrations/asyncOp';

/**
 * Minimal shape of an RTK Query lifecycle action. RTK Query dispatches actions
 * whose `meta.requestStatus` settles to `'fulfilled'` or `'rejected'`, with the
 * endpoint name under `meta.arg.endpointName`. We read only that subset and
 * never import `@reduxjs/toolkit`.
 */
interface RTKQueryActionLike {
  readonly type: string;
  readonly error?: unknown;
  readonly payload?: unknown;
  readonly meta?: {
    readonly requestStatus?: 'pending' | 'fulfilled' | 'rejected' | string;
    readonly arg?: { readonly endpointName?: string; readonly type?: string };
  };
}

/**
 * Minimal Redux middleware signature: `(api) => (next) => (action) => result`.
 * Typed structurally so the real RTK `Middleware` assigns to it without a
 * compile-time dependency on Redux.
 */
export type ObserveRTKQueryMiddleware = (
  api: unknown
) => (next: (action: RTKQueryActionLike) => unknown) => (action: RTKQueryActionLike) => unknown;

/** Options for {@link observeRTKQuery}. */
export interface ObserveRTKQueryOptions {
  /** Logger forwarded to `trackAsyncOperation`. Required for any output. */
  logger?: Logger;
  /** Optional namespace recorded on async-op telemetry. */
  namespace?: string;
}

/** Extracts a usable Error from an RTK `rejected` action. */
function actionError(action: RTKQueryActionLike): Error {
  // A rejected thunk carries `error` (a SerializedError) or a `payload`
  // (FetchBaseQueryError). Prefer whichever is present; fall back to the type.
  const raw = action.error ?? action.payload;
  if (raw instanceof Error) return raw;
  if (raw !== undefined && raw !== null) {
    const message =
      typeof raw === 'object' && 'message' in raw && typeof raw.message === 'string'
        ? raw.message
        : JSON.stringify(raw);
    return new Error(message);
  }
  return new Error(`RTK Query request rejected: ${action.type}`);
}

/**
 * Builds a Redux **middleware** that reports each rejected RTK Query request
 * through `trackAsyncOperation(...).onError`, so endpoint failures flow into the
 * Observability pipeline. Add it to your store's middleware chain.
 *
 * Imports no vendor SDK — the middleware is typed structurally, and an RTK
 * `Middleware` satisfies it. Only `rejected` lifecycle actions are reported,
 * keyed `rtkq:<endpointName>`; `pending`/`fulfilled` pass straight through.
 *
 * @example
 * ```ts
 * import { configureStore } from '@reduxjs/toolkit';
 * import { observeRTKQuery } from 'react-native-observability/observers/rtk-query';
 *
 * const store = configureStore({
 *   reducer,
 *   middleware: getDefault => getDefault().concat(api.middleware, observeRTKQuery({ logger })),
 * });
 * ```
 *
 * @stability stable
 */
export function observeRTKQuery(opts: ObserveRTKQueryOptions = {}): ObserveRTKQueryMiddleware {
  const baseOptions: Parameters<typeof trackAsyncOperation>[0] = {
    key: '', // overwritten per action
    ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
  };

  return () => next => action => {
    const result = next(action);
    if (action.meta?.requestStatus === 'rejected') {
      const endpoint = action.meta.arg?.endpointName ?? '<unknown>';
      const handle = trackAsyncOperation({ ...baseOptions, key: `rtkq:${endpoint}` });
      handle.onError(actionError(action));
    }
    return result;
  };
}
