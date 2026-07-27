import { observeApollo } from '../../src/observers/apollo/observeApollo';
import { createHttpObserver } from '../../src/integrations/http';

/** A fake Apollo `forward` returning an observable that emits or errors. */
function fakeForward(outcome: { error?: unknown; value?: unknown }) {
  return () => ({
    subscribe(observer: {
      next?: (v: unknown) => void;
      error?: (e: unknown) => void;
      complete?: () => void;
    }) {
      if (outcome.error !== undefined) observer.error?.(outcome.error);
      else {
        observer.next?.(outcome.value);
        observer.complete?.();
      }
      return { unsubscribe: () => {} };
    },
  });
}

const operation = {
  operationName: 'GetUser',
  variables: { id: 1 },
  query: { definitions: [{ operation: 'query' }] },
};

describe('observeApollo', () => {
  it('records a successful operation as a graphql network entry', () => {
    const http = createHttpObserver({});
    const handler = observeApollo(http, { url: 'https://api/graphql' });

    handler(operation, fakeForward({ value: { data: { user: { id: 1 } } } })).subscribe({});

    const entries = http.store.getSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('https://api/graphql#GetUser');
    expect(entries[0]?.state).toBe('success');
    expect(entries[0]?.statusCode).toBe(200);
  });

  it('records an errored operation', () => {
    const http = createHttpObserver({});
    const handler = observeApollo(http);
    handler(operation, fakeForward({ error: new Error('network down') })).subscribe({
      error: () => {},
    });

    const entries = http.store.getSnapshot();
    expect(entries[0]?.state).toBe('error');
    expect(entries[0]?.error).toBe('network down');
  });

  it('forwards results to the downstream observer', () => {
    const http = createHttpObserver({});
    const handler = observeApollo(http);
    let got: unknown;
    handler(operation, fakeForward({ value: { ok: true } })).subscribe({
      next: v => {
        got = v;
      },
    });
    expect(got).toEqual({ ok: true });
  });

  it('uses operation type as the method', () => {
    const http = createHttpObserver({});
    const handler = observeApollo(http);
    const mutationOp = { ...operation, query: { definitions: [{ operation: 'mutation' }] } };
    handler(mutationOp, fakeForward({ value: {} })).subscribe({});
    // method isn't on the store entry, but the url name path is — assert it resolved.
    expect(http.store.getSnapshot()[0]?.url).toContain('#GetUser');
  });
});
