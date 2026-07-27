import type { Logger } from '../../logger/Logger';

/** Options for {@link trackAsyncOperation}. */
export interface TrackAsyncOperationOptions {
  /** Identifier of the async operation, e.g. a React Query key or RPC name. */
  key: string;
  /**
   * Optional namespace passed through to the logger. The Observability logger
   * already maintains hierarchical namespaces; this is recorded as context.
   */
  namespace?: string;
  /**
   * Optional Observability logger. When provided, `onError` calls `logger.error`
   * and `onSuccess` is a no-op (success isn't worth a log entry by default —
   * consumers who want one can call `logger.info` themselves).
   */
  logger?: Logger;
}

/** Handle returned by {@link trackAsyncOperation}. */
export interface AsyncOperationHandle {
  /** Call on terminal failure of the async operation. */
  onError(error: Error): void;
  /**
   * Call on terminal success. Default implementation is a no-op; provided
   * for symmetry and future extension (timing, success counters).
   */
  onSuccess(): void;
}

/**
 * Provider-agnostic async-operation tracker.
 *
 * Used by vendor shims (`observeReactQuery`, `observeApollo`, `observeTrpc`)
 * to report terminal outcomes of queries / mutations / subscriptions through
 * the Observability pipeline.
 *
 * Knows nothing about React Query.
 *
 * @example
 * ```ts
 * const op = trackAsyncOperation({ key: 'fetchUser', logger });
 * try {
 *   await fetchUser();
 *   op.onSuccess();
 * } catch (e) {
 *   op.onError(e instanceof Error ? e : new Error(String(e)));
 *   throw e;
 * }
 * ```
 */
export function trackAsyncOperation(opts: TrackAsyncOperationOptions): AsyncOperationHandle {
  const { key, namespace, logger } = opts;
  return {
    onError(error: Error): void {
      if (logger === undefined) return;
      logger.error('Async operation failed', error, {
        key,
        ...(namespace !== undefined ? { namespace } : {}),
      });
    },
    onSuccess(): void {
      // Intentional no-op — see JSDoc.
    },
  };
}
