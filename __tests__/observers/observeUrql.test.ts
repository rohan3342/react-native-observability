import { observeUrql } from '../../src/observers/urql/observeUrql';
import { createHttpObserver } from '../../src/integrations/http';

function makeOp(key: number, kind = 'query') {
  return {
    key,
    kind,
    variables: { id: 1 },
    context: { url: 'https://api/graphql' },
    query: { definitions: [{ name: { value: 'GetThing' } }] },
  };
}

describe('observeUrql', () => {
  it('correlates onOperation→onResult by key and records success', () => {
    const http = createHttpObserver({});
    const obs = observeUrql(http);

    const op = makeOp(1);
    obs.onOperation(op);
    obs.onResult({ operation: op, data: { thing: 1 } });

    const entries = http.store.getSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.url).toBe('https://api/graphql#GetThing');
    expect(entries[0]?.state).toBe('success');
  });

  it('records an error result', () => {
    const http = createHttpObserver({});
    const obs = observeUrql(http);
    const op = makeOp(2);
    obs.onOperation(op);
    obs.onResult({ operation: op, error: new Error('combined graphql error') });

    const entries = http.store.getSnapshot();
    expect(entries[0]?.state).toBe('error');
    expect(entries[0]?.error).toBe('combined graphql error');
  });

  it('ignores teardown operations', () => {
    const http = createHttpObserver({});
    const obs = observeUrql(http);
    obs.onOperation(makeOp(3, 'teardown'));
    expect(http.store.getSnapshot()).toHaveLength(0);
  });

  it('skips a result with no matching start (cache-only)', () => {
    const http = createHttpObserver({});
    const obs = observeUrql(http);
    obs.onResult({ operation: makeOp(99), data: {} });
    expect(http.store.getSnapshot()).toHaveLength(0);
  });

  it('falls back to the option url when context omits one', () => {
    const http = createHttpObserver({});
    const obs = observeUrql(http, { url: 'fallback-endpoint' });
    const op = { key: 4, kind: 'query', query: { definitions: [{ name: { value: 'Q' } }] } };
    obs.onOperation(op);
    obs.onResult({ operation: op, data: {} });
    expect(http.store.getSnapshot()[0]?.url).toBe('fallback-endpoint#Q');
  });
});
