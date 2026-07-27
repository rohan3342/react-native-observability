import {
  NetworkLogStore,
  buildEndPatch,
  buildPendingEntry,
  type NetworkLogEntry,
} from '../../../src/integrations/http/NetworkLogStore';
import type { HttpEventStart } from '../../../src/integrations/http/types';

function pending(id: string, overrides: Partial<Omit<HttpEventStart, 'id'>> = {}): NetworkLogEntry {
  const base: HttpEventStart = {
    id,
    ts: 100,
    method: 'GET',
    url: `https://example.com/${id}`,
  };
  return buildPendingEntry({ ...base, ...overrides });
}

describe('NetworkLogStore — basics', () => {
  it('add() stores the entry', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    expect(store.getSnapshot()).toHaveLength(1);
    expect(store.getSnapshot()[0]?.id).toBe('a');
  });

  it('update() patches an existing entry by id', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    store.update('a', { state: 'success', statusCode: 200, durationMs: 50 });

    const e = store.getSnapshot()[0];
    expect(e?.state).toBe('success');
    expect(e?.statusCode).toBe(200);
    expect(e?.durationMs).toBe(50);
  });

  it('update() is a no-op for an unknown id', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    store.update('missing', { state: 'success' });
    expect(store.getSnapshot()[0]?.state).toBe('pending');
  });

  it('clear() empties the store', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    store.add(pending('b'));
    store.clear();
    expect(store.getSnapshot()).toHaveLength(0);
  });

  it('evicts oldest when maxSize is reached', () => {
    const store = new NetworkLogStore(2);
    store.add(pending('a'));
    store.add(pending('b'));
    store.add(pending('c'));

    const ids = store.getSnapshot().map(e => e.id);
    expect(ids).toEqual(['b', 'c']);
  });
});

describe('NetworkLogStore — getSnapshot immutability (audit I8 / E12)', () => {
  // Regression test for the v1 bug: getSnapshot() returned this.entries directly,
  // which was then mutated in place by add()/update(). React's concurrent
  // scheduler could miss re-renders because the reference never changed.

  it('returns a new reference on every add', () => {
    const store = new NetworkLogStore();
    const before = store.getSnapshot();
    store.add(pending('a'));
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
  });

  it('returns a new reference on every update', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    const before = store.getSnapshot();
    store.update('a', { state: 'success' });
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
  });

  it('returns a new reference on clear', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    const before = store.getSnapshot();
    store.clear();
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
  });

  it('previously-returned snapshots are not mutated by subsequent calls', () => {
    const store = new NetworkLogStore();
    store.add(pending('a'));
    const snap1 = store.getSnapshot();
    expect(snap1).toHaveLength(1);

    store.add(pending('b'));
    expect(snap1).toHaveLength(1); // snap1 must be unchanged
    expect(store.getSnapshot()).toHaveLength(2);
  });
});

describe('NetworkLogStore — subscribe', () => {
  it('notifies subscribers on add / update / clear', () => {
    const store = new NetworkLogStore();
    const listener = jest.fn();
    const unsub = store.subscribe(listener);

    store.add(pending('a'));
    store.update('a', { state: 'success' });
    store.clear();
    expect(listener).toHaveBeenCalledTimes(3);

    unsub();
    store.add(pending('b'));
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

describe('NetworkLogStore — entry.toCurl()', () => {
  it('reconstructs a curl command from the captured request', () => {
    const store = new NetworkLogStore();
    store.add(
      buildPendingEntry({
        id: 'x',
        ts: 0,
        method: 'POST',
        url: 'https://api.example.com/login',
        headers: { 'Content-Type': 'application/json' },
        body: { email: 'u@example.com' },
      })
    );

    const curl = store.getSnapshot()[0]?.toCurl();
    expect(curl).toContain(`curl -X POST`);
    expect(curl).toContain(`-H 'Content-Type: application/json'`);
    expect(curl).toContain(`-d '{"email":"u@example.com"}'`);
    expect(curl).toContain(`'https://api.example.com/login'`);
  });

  it('escapes single quotes in body strings', () => {
    const store = new NetworkLogStore();
    store.add(
      buildPendingEntry({
        id: 'x',
        ts: 0,
        method: 'POST',
        url: 'https://api.example.com',
        body: "it's tricky",
      })
    );

    const curl = store.getSnapshot()[0]?.toCurl();
    // 'it'\''s tricky' — single quote escape sequence for sh
    expect(curl).toContain(`-d 'it'\\''s tricky'`);
  });

  it('survives an entry being patched — request data is captured at start', () => {
    const store = new NetworkLogStore();
    store.add(
      buildPendingEntry({
        id: 'x',
        ts: 0,
        method: 'GET',
        url: 'https://example.com/a',
      })
    );
    store.update('x', { state: 'success', responseBody: { foo: 'bar' } });

    const curl = store.getSnapshot()[0]?.toCurl();
    expect(curl).toContain(`'https://example.com/a'`);
    expect(curl).not.toContain('foo'); // response shouldn't leak into the request curl
  });
});

describe('buildEndPatch', () => {
  it('maps end events with status to success state', () => {
    const patch = buildEndPatch({ id: 'x', durationMs: 12, status: 201 });
    expect(patch.state).toBe('success');
    expect(patch.statusCode).toBe(201);
    expect(patch.durationMs).toBe(12);
  });

  it('maps end events with an error to error state', () => {
    const patch = buildEndPatch({
      id: 'x',
      durationMs: 12,
      error: new Error('timeout'),
    });
    expect(patch.state).toBe('error');
    expect(patch.error).toBe('timeout');
  });
});
