import type { HttpObserver } from '../../integrations/http';

/**
 * A function that executes a GraphQL operation. Structurally satisfied by
 * `graphql-request`'s `request`, an Apollo/urql `fetch`-style executor, or any
 * `(query, variables?) => Promise<data>` you already have. We never import a
 * GraphQL client — this shim instruments whatever executor you pass.
 */
export type GraphQLExecutor<TArgs extends unknown[] = unknown[], TResult = unknown> = (
  ...args: TArgs
) => Promise<TResult>;

/** Options for {@link observeGraphQL}. */
export interface ObserveGraphQLOptions {
  /**
   * The endpoint URL recorded on each event. GraphQL multiplexes operations
   * over one URL, so we record it here and disambiguate by operation name.
   * Default: `'graphql'`.
   */
  url?: string;
  /**
   * Capture the response `data` payload on the network entry. Default `false` —
   * GraphQL responses can be large, and they often contain user data that
   * (unlike HTTP bodies fed through `createHttpObserver`) is not redacted here.
   */
  captureData?: boolean;
}

let idCounter = 0;
function generateId(): string {
  return `gql-${Date.now()}-${(++idCounter).toString(36)}`;
}

/** Best-effort extraction of an operation name + type from a query string. */
function parseOperation(query: unknown): { name: string; type: string } {
  if (typeof query !== 'string') return { name: 'anonymous', type: 'operation' };
  // Matches `query Foo`, `mutation Bar`, `subscription Baz`, or a bare `{ ... }`.
  const m = /^\s*(query|mutation|subscription)?\s*([A-Za-z_][A-Za-z0-9_]*)?/.exec(query);
  const type = m?.[1] ?? 'query';
  const name = m?.[2] ?? 'anonymous';
  return { name, type };
}

/**
 * Wraps a GraphQL executor so each operation is recorded as a network event in
 * the provider-agnostic {@link HttpObserver} — proving the integration layer
 * extends *any* client, not just HTTP libraries.
 *
 * The returned function has the same signature as the one you passed; swap it in
 * wherever you call your GraphQL client.
 *
 * @example
 * ```ts
 * import { GraphQLClient } from 'graphql-request';
 * import { createHttpObserver } from 'react-native-observability';
 * import { observeGraphQL } from 'react-native-observability/observers/graphql';
 *
 * const http = createHttpObserver({ logger });
 * const client = new GraphQLClient(endpoint);
 * const request = observeGraphQL(client.request.bind(client), http, { url: endpoint });
 * const data = await request(QUERY, variables);
 * ```
 *
 * @stability stable
 */
export function observeGraphQL<TArgs extends unknown[], TResult>(
  executor: GraphQLExecutor<TArgs, TResult>,
  http: HttpObserver,
  options: ObserveGraphQLOptions = {}
): GraphQLExecutor<TArgs, TResult> {
  const url = options.url ?? 'graphql';
  const captureData = options.captureData ?? false;

  return (...args: TArgs): Promise<TResult> => {
    const id = generateId();
    const ts = Date.now();
    const { name, type } = parseOperation(args[0]);
    const variables = args[1];

    http.onStart({
      id,
      ts,
      source: 'graphql',
      method: type.toUpperCase(),
      url: `${url}#${name}`,
      ...(variables !== undefined ? { body: variables } : {}),
    });

    return executor(...args).then(
      result => {
        http.onEnd({
          id,
          durationMs: Date.now() - ts,
          status: 200,
          ...(captureData ? { responseBody: result } : {}),
        });
        return result;
      },
      (error: unknown) => {
        http.onEnd({
          id,
          durationMs: Date.now() - ts,
          // A GraphQL transport error may carry an HTTP status; default to 0.
          status: (error as { response?: { status?: number } })?.response?.status ?? 0,
          error: error instanceof Error ? error : new Error(String(error)),
        });
        throw error;
      }
    );
  };
}
