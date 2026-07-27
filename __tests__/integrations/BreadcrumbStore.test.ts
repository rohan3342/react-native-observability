import { BreadcrumbStore } from '../../src/integrations/breadcrumbs/BreadcrumbStore';
import type { BreadcrumbPersistence } from '../../src/integrations/breadcrumbs/BreadcrumbStore';
import { BreadcrumbTransport } from '../../src/integrations/breadcrumbs/BreadcrumbTransport';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry } from '../../src/logger/types';

function crumb(over: Partial<Parameters<BreadcrumbStore['record']>[0]> = {}) {
  return {
    timestamp: 1000,
    kind: 'log' as const,
    level: 'info' as const,
    message: 'hello',
    ...over,
  };
}

function fakePersistence(): BreadcrumbPersistence & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: k => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: k => void data.delete(k),
  };
}

describe('BreadcrumbStore — ring buffer', () => {
  it('records breadcrumbs and exposes them via getSnapshot', () => {
    const s = new BreadcrumbStore();
    s.record(crumb({ message: 'first' }));
    s.record(crumb({ message: 'second' }));
    expect(s.getSnapshot().map(c => c.message)).toEqual(['first', 'second']);
  });

  it('assigns a stable id when none is given', () => {
    const s = new BreadcrumbStore();
    s.record(crumb());
    s.record(crumb());
    const [a, b] = s.getSnapshot();
    expect(a?.id).toBeDefined();
    expect(a?.id).not.toBe(b?.id);
  });

  it('drops the oldest past maxEntries', () => {
    const s = new BreadcrumbStore(3);
    for (let i = 0; i < 5; i++) s.record(crumb({ message: `m${i}` }));
    expect(s.getSnapshot().map(c => c.message)).toEqual(['m2', 'm3', 'm4']);
  });

  it('returns a ===-distinct snapshot per mutation', () => {
    const s = new BreadcrumbStore();
    const before = s.getSnapshot();
    s.record(crumb());
    expect(s.getSnapshot()).not.toBe(before);
  });

  it('notifies subscribers on record + clear', () => {
    const s = new BreadcrumbStore();
    const listener = jest.fn();
    const off = s.subscribe(listener);
    s.record(crumb());
    s.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    s.record(crumb());
    expect(listener).toHaveBeenCalledTimes(2); // not called after unsubscribe
  });
});

describe('BreadcrumbStore — persistence / crash trail', () => {
  it('mirrors the buffer to persistence under the session key', () => {
    const p = fakePersistence();
    const s = new BreadcrumbStore();
    s.configurePersistence(p, 'sess-1');
    s.record(crumb({ message: 'crumb-a' }));
    expect(p.data.has('observability.breadcrumbs.sess-1')).toBe(true);
    const stored = JSON.parse(p.data.get('observability.breadcrumbs.sess-1')!);
    expect(stored).toHaveLength(1);
    expect(stored[0].message).toBe('crumb-a');
  });

  it('loadTrail reads a prior session trail (the crash trail)', () => {
    const p = fakePersistence();
    // Simulate a prior crashed session's persisted trail.
    const prior = new BreadcrumbStore();
    prior.configurePersistence(p, 'crashed-sess');
    prior.record(crumb({ message: 'before crash' }));

    // A fresh store on next launch reads it.
    const next = new BreadcrumbStore();
    next.configurePersistence(p, 'new-sess');
    const trail = next.loadTrail('crashed-sess');
    expect(trail.map(c => c.message)).toEqual(['before crash']);
  });

  it('loadTrail returns [] with no persistence or unknown session', () => {
    expect(new BreadcrumbStore().loadTrail('x')).toEqual([]);
    const p = fakePersistence();
    const s = new BreadcrumbStore();
    s.configurePersistence(p, 'a');
    expect(s.loadTrail('does-not-exist')).toEqual([]);
  });

  it('clearTrail removes a persisted trail', () => {
    const p = fakePersistence();
    const s = new BreadcrumbStore();
    s.configurePersistence(p, 'sess-1');
    s.record(crumb());
    expect(p.data.has('observability.breadcrumbs.sess-1')).toBe(true);
    s.clearTrail('sess-1');
    expect(p.data.has('observability.breadcrumbs.sess-1')).toBe(false);
  });

  it('is in-memory only (no throw) when persistence is null', () => {
    const s = new BreadcrumbStore();
    expect(() => s.record(crumb())).not.toThrow();
    expect(s.getSnapshot()).toHaveLength(1);
  });

  it('survives a persistence write that throws', () => {
    const p: BreadcrumbPersistence = {
      getItem: () => null,
      setItem: () => {
        throw new Error('disk full');
      },
    };
    const s = new BreadcrumbStore();
    s.configurePersistence(p, 'sess');
    expect(() => s.record(crumb())).not.toThrow();
    expect(s.getSnapshot()).toHaveLength(1); // still recorded in memory
  });
});

function logEntry(over: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'l1',
    timestamp: 2000,
    level: LogLevel.INFO,
    namespace: 'app',
    message: 'hello',
    ...over,
  };
}

describe('BreadcrumbTransport', () => {
  it('records a log entry as a log breadcrumb with mapped level', () => {
    const store = new BreadcrumbStore();
    const transport = new BreadcrumbTransport({ store });
    transport.write(logEntry({ message: 'boom', level: LogLevel.ERROR, namespace: 'auth' }));
    const [c] = store.getSnapshot();
    expect(c?.kind).toBe('log');
    expect(c?.level).toBe('error');
    expect(c?.message).toBe('boom');
    expect(c?.category).toBe('auth');
  });

  it('classifies screen:mount / screen:unmount as navigation breadcrumbs', () => {
    const store = new BreadcrumbStore();
    const transport = new BreadcrumbTransport({ store });
    transport.write(logEntry({ message: 'screen:mount' }));
    transport.write(logEntry({ message: 'screen:unmount' }));
    expect(store.getSnapshot().map(c => c.kind)).toEqual(['navigation', 'navigation']);
  });

  it('carries context through as breadcrumb data', () => {
    const store = new BreadcrumbStore();
    const transport = new BreadcrumbTransport({ store });
    transport.write(logEntry({ context: { userId: 1 } }));
    expect(store.getSnapshot()[0]?.data).toEqual({ userId: 1 });
  });

  it('defaults to the shared store when none is passed', () => {
    const transport = new BreadcrumbTransport();
    expect(transport.name).toBe('breadcrumb');
    expect(() => transport.write(logEntry())).not.toThrow();
  });
});
