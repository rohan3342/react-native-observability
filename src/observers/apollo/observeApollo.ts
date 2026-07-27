import type { HttpObserver } from '../../integrations/http';

/**
 * Minimal shape of an Apollo `Operation`. Structurally satisfied by
 * `@apollo/client`'s `Operation`; we read the operation name and variables and
 * never import Apollo.
 */
interface ApolloOperationLike {
  operationName?: string;
  variables?: Record<string, unknown>;
  query?: { definitions?: ReadonlyArray<{ operation?: string }> };
}

/** Minimal Apollo observable — the subset of `zen-observable` we subscribe to. */
interface ApolloObservableLike<T> {
  subscribe(observer: {
    next?: (value: T) => void;
    error?: (err: unknown) => void;
    complete?: () => void;
  }): { unsubscribe(): void };
}

/** `forward(operation)` continues the link chain and returns an observable. */
type ApolloForward = (operation: ApolloOperationLike) => ApolloObservableLike<unknown>;

/**
 * The functional Apollo link shape: `(operation, forward) => observable`.
 * `new ApolloLink(observeApollo(http))` produces a real link, and this also
 * assigns where Apollo expects a `RequestHandler`.
 */
export type ApolloRequestHandler = (
  operation: ApolloOperationLike,
  forward: ApolloForward
) => ApolloObservableLike<unknown>;

/** Options for {@link observeApollo}. */
export interface ObserveApolloOptions {
  /** Endpoint URL recorded on each event. Default: `'graphql'`. */
  url?: string;
  /** Capture the response `data` payload. Default `false` (responses can be large / contain PII). */
  captureData?: boolean;
}

let idCounter = 0;
function generateId(): string {
  return `apollo-${Date.now()}-${(++idCounter).toString(36)}`;
}

function operationType(op: ApolloOperationLike): string {
  return op.query?.definitions?.find(d => d.operation !== undefined)?.operation ?? 'query';
}

/**
 * Builds an Apollo Link `RequestHandler` that records each GraphQL operation as
 * a network event in the provider-agnostic {@link HttpObserver}. Wrap it in
 * `new ApolloLink(...)` and place it ahead of your terminating `HttpLink`.
 *
 * Imports no Apollo code — the operation/observable types are structural.
 * Operations are disambiguated by name (`url#OperationName`) and tagged
 * `source: 'graphql'`, matching the GraphQL observer's scheme.
 *
 * @example
 * ```ts
 * import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
 * import { createHttpObserver } from 'react-native-observability';
 * import { observeApollo } from 'react-native-observability/observers/apollo';
 *
 * const http = createHttpObserver({ logger });
 * const client = new ApolloClient({
 *   cache: new InMemoryCache(),
 *   link: ApolloLink.from([new ApolloLink(observeApollo(http, { url })), new HttpLink({ uri: url })]),
 * });
 * ```
 *
 * @stability stable
 */
export function observeApollo(
  http: HttpObserver,
  options: ObserveApolloOptions = {}
): ApolloRequestHandler {
  const url = options.url ?? 'graphql';
  const captureData = options.captureData ?? false;

  return (operation, forward) => {
    const id = generateId();
    const ts = Date.now();
    const name = operation.operationName ?? 'anonymous';
    const variables = operation.variables;

    http.onStart({
      id,
      ts,
      source: 'graphql',
      method: operationType(operation).toUpperCase(),
      url: `${url}#${name}`,
      ...(variables !== undefined ? { body: variables } : {}),
    });

    const result$ = forward(operation);
    return {
      subscribe(observer) {
        let settled = false;
        return result$.subscribe({
          next: value => {
            // First payload marks a successful round-trip (subscriptions may
            // emit more than once; we record the first as the "end").
            if (!settled) {
              settled = true;
              http.onEnd({
                id,
                durationMs: Date.now() - ts,
                status: 200,
                ...(captureData ? { responseBody: value } : {}),
              });
            }
            observer.next?.(value);
          },
          error: err => {
            if (!settled) {
              settled = true;
              http.onEnd({
                id,
                durationMs: Date.now() - ts,
                status: (err as { statusCode?: number })?.statusCode ?? 0,
                error: err instanceof Error ? err : new Error(String(err)),
              });
            }
            observer.error?.(err);
          },
          complete: () => observer.complete?.(),
        });
      },
    };
  };
}
