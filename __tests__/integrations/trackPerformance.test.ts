import { trackPerformance } from '../../src/integrations/perf/trackPerformance';
import { PerfStore, getPerfStore, _resetPerfStore } from '../../src/integrations/perf/PerfStore';

beforeEach(() => {
  _resetPerfStore();
});

describe('trackPerformance', () => {
  it('records a span into the provided store on end()', () => {
    const store = new PerfStore();
    const span = trackPerformance('decode', { store });
    const ms = span.end({ bytes: 10 });
    expect(typeof ms).toBe('number');
    const spans = store.getSnapshot();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('decode');
    expect(spans[0]?.context).toEqual({ bytes: 10 });
  });

  it('is idempotent — a second end() does not double-record', () => {
    const store = new PerfStore();
    const span = trackPerformance('x', { store });
    span.end();
    span.end();
    expect(store.getSnapshot()).toHaveLength(1);
  });

  it('defaults to the singleton store', () => {
    const span = trackPerformance('global-op');
    span.end();
    expect(
      getPerfStore()
        .getSnapshot()
        .some(s => s.name === 'global-op')
    ).toBe(true);
  });

  it('logs at DEBUG when a logger is supplied', () => {
    const debug = jest.fn();
    const logger = { debug } as unknown as import('../../src/logger/Logger').Logger;
    const span = trackPerformance('op', { store: new PerfStore(), logger });
    span.end({ a: 1 });
    expect(debug).toHaveBeenCalledWith('perf:op', expect.objectContaining({ a: 1 }));
  });
});

describe('PerfStore', () => {
  it('notifies subscribers and yields ===-distinct snapshots', () => {
    const store = new PerfStore();
    let calls = 0;
    store.subscribe(() => calls++);
    const before = store.getSnapshot();
    store.add({ name: 'a', durationMs: 1, startedAt: 0 });
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(before);
  });

  it('drops oldest past maxEntries (ring buffer)', () => {
    const store = new PerfStore(2);
    store.add({ name: 'a', durationMs: 1, startedAt: 0 });
    store.add({ name: 'b', durationMs: 1, startedAt: 1 });
    store.add({ name: 'c', durationMs: 1, startedAt: 2 });
    expect(store.getSnapshot().map(s => s.name)).toEqual(['b', 'c']);
  });

  it('clear() empties the buffer and notifies', () => {
    const store = new PerfStore();
    store.add({ name: 'a', durationMs: 1, startedAt: 0 });
    let cleared = false;
    store.subscribe(() => (cleared = true));
    store.clear();
    expect(store.getSnapshot()).toHaveLength(0);
    expect(cleared).toBe(true);
  });
});
