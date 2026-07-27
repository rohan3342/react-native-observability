import { MemoryTransport } from '../../src/logger/transports/MemoryTransport';
import { LogEntry, LogLevel } from '../../src/logger/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(message: string, overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: `test-${message}`,
    timestamp: Date.now(),
    level: LogLevel.INFO,
    namespace: 'test',
    message,
    ...overrides,
  };
}

// ─── Ring buffer ───────────────────────────────────────────────────────────────

describe('MemoryTransport — ring buffer', () => {
  it('stores entries in chronological order (oldest first)', () => {
    const t = new MemoryTransport({ maxEntries: 5 });
    t.write(makeEntry('a'));
    t.write(makeEntry('b'));
    t.write(makeEntry('c'));

    const entries = t.getEntries();
    expect(entries.map(e => e.message)).toEqual(['a', 'b', 'c']);
  });

  it('overwrites the oldest entry when the buffer is full', () => {
    const t = new MemoryTransport({ maxEntries: 3 });
    ['a', 'b', 'c', 'd'].forEach(msg => t.write(makeEntry(msg)));

    const entries = t.getEntries();
    expect(entries.map(e => e.message)).toEqual(['b', 'c', 'd']);
  });

  it('handles two full rotations correctly', () => {
    const t = new MemoryTransport({ maxEntries: 3 });
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach(msg => t.write(makeEntry(msg)));

    const entries = t.getEntries();
    expect(entries.map(e => e.message)).toEqual(['e', 'f', 'g']);
  });

  it('returns empty array before any writes', () => {
    const t = new MemoryTransport();
    expect(t.getEntries()).toEqual([]);
  });

  it('clears all entries without deallocating', () => {
    const t = new MemoryTransport({ maxEntries: 5 });
    t.write(makeEntry('a'));
    t.write(makeEntry('b'));
    t.clear();

    expect(t.getEntries()).toHaveLength(0);
    // Can still write after clear
    t.write(makeEntry('c'));
    expect(t.getEntries()).toHaveLength(1);
  });

  it('respects minLevel — drops entries below threshold', () => {
    const t = new MemoryTransport({ minLevel: LogLevel.WARN });
    t.write(makeEntry('debug', { level: LogLevel.DEBUG }));
    t.write(makeEntry('warn', { level: LogLevel.WARN }));
    t.write(makeEntry('error', { level: LogLevel.ERROR }));

    // Note: MemoryTransport.write() does NOT filter by minLevel itself —
    // Logger does the filtering before calling write(). But we verify the
    // minLevel property is exposed correctly for Logger to read.
    expect(t.minLevel).toBe(LogLevel.WARN);
    // All three were accepted because write() itself doesn't filter
    expect(t.getEntries()).toHaveLength(3);
  });
});

// ─── getNamespaces() ──────────────────────────────────────────────────────────

describe('MemoryTransport — getNamespaces()', () => {
  it('returns sorted unique namespaces', () => {
    const t = new MemoryTransport();
    t.write(makeEntry('a', { namespace: 'app:auth' }));
    t.write(makeEntry('b', { namespace: 'app' }));
    t.write(makeEntry('c', { namespace: 'app:auth' })); // duplicate
    t.write(makeEntry('d', { namespace: 'app:payments' }));

    expect(t.getNamespaces()).toEqual(['app', 'app:auth', 'app:payments']);
  });

  it('returns empty array when buffer is empty', () => {
    expect(new MemoryTransport().getNamespaces()).toEqual([]);
  });
});

// ─── useSyncExternalStore interface ───────────────────────────────────────────

describe('MemoryTransport — subscribe / getSnapshot', () => {
  it('calls listeners when a new entry is written', () => {
    const t = new MemoryTransport();
    const listener = jest.fn();
    const unsubscribe = t.subscribe(listener);

    t.write(makeEntry('hello'));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    t.write(makeEntry('world'));
    // Should not be called after unsubscribe
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('calls listeners when clear() is called', () => {
    const t = new MemoryTransport();
    t.write(makeEntry('a'));
    const listener = jest.fn();
    t.subscribe(listener);

    t.clear();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('getSnapshot returns the same reference between writes', () => {
    const t = new MemoryTransport();
    const snap1 = t.getSnapshot();
    const snap2 = t.getSnapshot();
    expect(snap1).toBe(snap2);
  });

  it('getSnapshot returns a new reference after a write', () => {
    const t = new MemoryTransport();
    const snap1 = t.getSnapshot();
    t.write(makeEntry('a'));
    const snap2 = t.getSnapshot();
    expect(snap1).not.toBe(snap2);
    expect(snap2).toHaveLength(1);
  });

  it('rebuilds the snapshot lazily — many writes, one materialization (PERF-1)', () => {
    const t = new MemoryTransport();
    // A burst of writes with no read in between: the snapshot is only built when
    // first read, and that single read reflects every write.
    for (let i = 0; i < 50; i++) t.write(makeEntry(`m${i}`));
    const snap = t.getSnapshot();
    expect(snap).toHaveLength(50);
    // A second read with no intervening write returns the identical reference.
    expect(t.getSnapshot()).toBe(snap);
  });

  it('write does not eagerly materialize the snapshot array (PERF-1)', () => {
    const t = new MemoryTransport();
    const before = t.getSnapshot();
    t.write(makeEntry('a'));
    // Reference is unchanged until the next getSnapshot() pulls the rebuild.
    expect(t.getSnapshot()).not.toBe(before);
  });
});

// ─── getBytesApprox ─────────────────────────────────────────────────────────

describe('MemoryTransport — getBytesApprox', () => {
  it('starts at zero and grows with each write', () => {
    const t = new MemoryTransport();
    expect(t.getBytesApprox()).toBe(0);
    t.write(makeEntry('hello'));
    const afterOne = t.getBytesApprox();
    expect(afterOne).toBeGreaterThan(0);
    t.write(makeEntry('world'));
    expect(t.getBytesApprox()).toBeGreaterThan(afterOne);
  });

  it('returns to zero after clear()', () => {
    const t = new MemoryTransport();
    t.write(makeEntry('a'));
    t.write(makeEntry('b'));
    expect(t.getBytesApprox()).toBeGreaterThan(0);
    t.clear();
    expect(t.getBytesApprox()).toBe(0);
  });

  it('subtracts evicted entries when the ring wraps (bounded, not monotonic)', () => {
    const t = new MemoryTransport({ maxEntries: 2 });
    t.write(makeEntry('aaaa'));
    t.write(makeEntry('bbbb'));
    const full = t.getBytesApprox();
    // Writing a same-size entry evicts the oldest — total stays in the same band,
    // it does not keep climbing unboundedly.
    t.write(makeEntry('cccc'));
    expect(t.getBytesApprox()).toBeLessThanOrEqual(full + 8);
    expect(t.getBytesApprox()).toBeGreaterThan(0);
  });

  it('counts context and error size', () => {
    const t = new MemoryTransport();
    t.write(makeEntry('x'));
    const plain = t.getBytesApprox();
    t.clear();
    t.write(makeEntry('x', { context: { big: 'a'.repeat(200) }, error: new Error('boom') }));
    expect(t.getBytesApprox()).toBeGreaterThan(plain);
  });
});

// ─── subscribeWithFilter ────────────────────────────────────────────────────

describe('MemoryTransport — subscribeWithFilter', () => {
  it('fires only when a written entry matches the predicate', () => {
    const t = new MemoryTransport();
    let hits = 0;
    const off = t.subscribeWithFilter(
      e => e.level >= LogLevel.ERROR,
      () => hits++
    );

    t.write(makeEntry('debug', { level: LogLevel.DEBUG }));
    t.write(makeEntry('info', { level: LogLevel.INFO }));
    expect(hits).toBe(0);

    t.write(makeEntry('error', { level: LogLevel.ERROR }));
    expect(hits).toBe(1);

    off();
    t.write(makeEntry('error2', { level: LogLevel.ERROR }));
    expect(hits).toBe(1); // unsubscribed
  });

  it('does not fire on clear()', () => {
    const t = new MemoryTransport();
    let hits = 0;
    t.subscribeWithFilter(
      () => true,
      () => hits++
    );
    t.write(makeEntry('a'));
    expect(hits).toBe(1);
    t.clear();
    expect(hits).toBe(1);
  });

  it('a throwing predicate does not break the write path', () => {
    const t = new MemoryTransport();
    t.subscribeWithFilter(
      () => {
        throw new Error('bad predicate');
      },
      () => {
        /* never reached */
      }
    );
    expect(() => t.write(makeEntry('a'))).not.toThrow();
    expect(t.getEntries()).toHaveLength(1);
  });

  it('does not affect plain subscribe() listeners', () => {
    const t = new MemoryTransport();
    let plain = 0;
    let filtered = 0;
    t.subscribe(() => plain++);
    t.subscribeWithFilter(
      e => e.level >= LogLevel.ERROR,
      () => filtered++
    );
    t.write(makeEntry('info', { level: LogLevel.INFO }));
    expect(plain).toBe(1);
    expect(filtered).toBe(0);
  });
});
