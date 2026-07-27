import { observeReactQuery } from '../../../src/observers/react-query/observeReactQuery';
import { Logger } from '../../../src/logger/Logger';
import { LogLevel } from '../../../src/logger/types';

interface QueryCacheCb {
  (event: {
    type: string;
    query: { queryKey: unknown[]; state: { status: string; error: unknown } };
  }): void;
}
interface MutationCacheCb {
  (event: {
    type: string;
    mutation: {
      options: { mutationKey?: unknown[] };
      state: { status: string; error: unknown };
    };
  }): void;
}

function makeClient(includeMutationCache = true): {
  client: Parameters<typeof observeReactQuery>[0];
  fireQuery: QueryCacheCb;
  fireMutation: MutationCacheCb;
  unsubQueryCalled: { value: boolean };
  unsubMutationCalled: { value: boolean };
} {
  let queryCb: QueryCacheCb | null = null;
  let mutationCb: MutationCacheCb | null = null;
  const unsubQueryCalled = { value: false };
  const unsubMutationCalled = { value: false };

  const client = {
    getQueryCache: () => ({
      subscribe: (cb: QueryCacheCb) => {
        queryCb = cb;
        return () => {
          unsubQueryCalled.value = true;
        };
      },
    }),
    ...(includeMutationCache
      ? {
          getMutationCache: () => ({
            subscribe: (cb: MutationCacheCb) => {
              mutationCb = cb;
              return () => {
                unsubMutationCalled.value = true;
              };
            },
          }),
        }
      : {}),
  };

  return {
    client: client as unknown as Parameters<typeof observeReactQuery>[0],
    fireQuery: ((e: Parameters<QueryCacheCb>[0]) => queryCb?.(e)) as QueryCacheCb,
    fireMutation: ((e: Parameters<MutationCacheCb>[0]) => mutationCb?.(e)) as MutationCacheCb,
    unsubQueryCalled,
    unsubMutationCalled,
  };
}

function makeLogger(): {
  logger: Logger;
  writes: Array<{ message: string; context: Record<string, unknown> | undefined; level: LogLevel }>;
} {
  const writes: Array<{
    message: string;
    context: Record<string, unknown> | undefined;
    level: LogLevel;
  }> = [];
  const logger = new Logger({
    namespace: 'test',
    level: LogLevel.DEBUG,
    transports: [
      {
        name: 'capture',
        minLevel: LogLevel.DEBUG,
        write: e =>
          writes.push({
            message: e.message,
            context: e.context as Record<string, unknown> | undefined,
            level: e.level,
          }),
      },
    ],
  });
  return { logger, writes };
}

describe('observeReactQuery — query errors', () => {
  it('logs an error when a query transitions to error state', () => {
    const { client, fireQuery } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger });

    fireQuery({
      type: 'updated',
      query: {
        queryKey: ['users', 42],
        state: { status: 'error', error: new Error('fetch failed') },
      },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.message).toBe('Async operation failed');
    expect(writes[0]?.context?.['key']).toBe('query:["users",42]');
  });

  it('does not log on non-error status transitions', () => {
    const { client, fireQuery } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger });

    fireQuery({
      type: 'updated',
      query: { queryKey: ['x'], state: { status: 'success', error: null } },
    });

    expect(writes).toHaveLength(0);
  });

  it('does not log on non-"updated" event types', () => {
    const { client, fireQuery } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger });

    fireQuery({
      type: 'added',
      query: { queryKey: ['x'], state: { status: 'error', error: new Error('e') } },
    });

    expect(writes).toHaveLength(0);
  });

  it('wraps non-Error error values', () => {
    const { client, fireQuery } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger });

    fireQuery({
      type: 'updated',
      query: { queryKey: ['x'], state: { status: 'error', error: 'string error' } },
    });

    expect(writes).toHaveLength(1);
  });
});

describe('observeReactQuery — mutation errors', () => {
  it('logs mutation errors with a mutation: key prefix', () => {
    const { client, fireMutation } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger });

    fireMutation({
      type: 'updated',
      mutation: {
        options: { mutationKey: ['createUser'] },
        state: { status: 'error', error: new Error('boom') },
      },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.context?.['key']).toBe('mutation:["createUser"]');
  });

  it('labels anonymous mutations', () => {
    const { client, fireMutation } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger });

    fireMutation({
      type: 'updated',
      mutation: {
        options: {},
        state: { status: 'error', error: new Error('boom') },
      },
    });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.context?.['key']).toBe('mutation:<anonymous>');
  });

  it('is tolerant of clients without getMutationCache (older RQ versions)', () => {
    const { client, fireQuery } = makeClient(false);
    const { logger, writes } = makeLogger();
    const cleanup = observeReactQuery(client, { logger });

    fireQuery({
      type: 'updated',
      query: { queryKey: ['x'], state: { status: 'error', error: new Error('e') } },
    });

    expect(writes).toHaveLength(1);
    expect(() => cleanup()).not.toThrow();
  });
});

describe('observeReactQuery — cleanup', () => {
  it('cleanup() unsubscribes from both caches', () => {
    const { client, unsubQueryCalled, unsubMutationCalled } = makeClient();
    const { logger } = makeLogger();

    const cleanup = observeReactQuery(client, { logger });
    cleanup();

    expect(unsubQueryCalled.value).toBe(true);
    expect(unsubMutationCalled.value).toBe(true);
  });
});

describe('observeReactQuery — namespace forwarding', () => {
  it('passes namespace to the logged context', () => {
    const { client, fireQuery } = makeClient();
    const { logger, writes } = makeLogger();
    observeReactQuery(client, { logger, namespace: 'data' });

    fireQuery({
      type: 'updated',
      query: { queryKey: ['x'], state: { status: 'error', error: new Error('e') } },
    });

    expect(writes[0]?.context?.['namespace']).toBe('data');
  });
});
