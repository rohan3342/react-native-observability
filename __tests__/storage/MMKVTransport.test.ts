import { MMKVTransport } from '../../src/storage/MMKVTransport';
import type { MMKVLike } from '../../src/storage/createStorage';
import { deserialize } from '../../src/storage/schema';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry } from '../../src/logger/types';

/**
 * In-memory `MMKVLike` stub. Tracks every set/get/delete so we can assert
 * on the per-entry key scheme and counter behaviour.
 */
class FakeMMKV implements MMKVLike {
  readonly data = new Map<string, string | number | boolean>();

  set(key: string, value: string | number | boolean): void {
    this.data.set(key, value);
  }
  getString(key: string): string | undefined {
    const v = this.data.get(key);
    return typeof v === 'string' ? v : undefined;
  }
  getNumber(key: string): number | undefined {
    const v = this.data.get(key);
    return typeof v === 'number' ? v : undefined;
  }
  getBoolean(key: string): boolean | undefined {
    const v = this.data.get(key);
    return typeof v === 'boolean' ? v : undefined;
  }
  contains(key: string): boolean {
    return this.data.has(key);
  }
  delete(key: string): void {
    this.data.delete(key);
  }
  getAllKeys(): string[] {
    return [...this.data.keys()];
  }
}

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'e1',
    timestamp: 100,
    level: LogLevel.INFO,
    namespace: 'app',
    message: 'hello',
    ...overrides,
  };
}

describe('MMKVTransport — write', () => {
  it('writes entries under per-entry keys with a monotonic counter', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');

    t.write(entry({ id: 'a' }));
    t.write(entry({ id: 'b' }));
    t.flush(); // write-behind buffer — drain to MMKV before inspecting keys

    expect(mmkv.contains('t:l:s1:0')).toBe(true);
    expect(mmkv.contains('t:l:s1:1')).toBe(true);
    expect(mmkv.getNumber('t:l:s1:meta:next')).toBe(2);
  });

  it('write() itself only touches the seq counter — entry I/O is deferred (write-behind)', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');

    // A single write buffers the entry in memory; only meta:next is set eagerly.
    t.write(entry({ id: 'e0' }));
    expect(mmkv.contains('t:l:s1:0')).toBe(false); // not persisted yet
    expect(mmkv.getNumber('t:l:s1:meta:next')).toBe(1); // seq allocated

    t.flush();
    expect(mmkv.contains('t:l:s1:0')).toBe(true); // now persisted
  });

  it('defaults sessionId to "default" when setSessionId is not called', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });

    t.write(entry());
    t.flush();

    expect(mmkv.contains('t:l:default:0')).toBe(true);
  });

  it('the persisted payload is wrapped in a schema envelope', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');
    t.write(entry({ message: 'hi', level: LogLevel.ERROR }));
    t.flush();

    const raw = mmkv.getString('t:l:s1:0');
    expect(raw).toBeDefined();
    const result = deserialize<{ message: string; level: LogLevel }>(raw!);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.message).toBe('hi');
  });

  it('serializes Error.stack / .name and reconstructs an Error on read', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');

    const err = new Error('boom');
    err.stack = 'at fn (file.ts:1)';
    t.write(entry({ error: err, level: LogLevel.ERROR }));

    const entries = t.getEntriesForSession('s1');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.error).toBeInstanceOf(Error);
    expect(entries[0]?.error?.message).toBe('boom');
    expect(entries[0]?.error?.stack).toBe('at fn (file.ts:1)');
  });

  it('never throws when MMKV.set errors', () => {
    const mmkv = new FakeMMKV();
    jest.spyOn(mmkv, 'set').mockImplementation(() => {
      throw new Error('disk full');
    });
    const t = new MMKVTransport({ storage: mmkv });
    expect(() => t.write(entry())).not.toThrow();
  });
});

describe('MMKVTransport — eviction', () => {
  it('drops the oldest entries once the session exceeds maxEntries', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv, maxEntries: 3 });
    t.setSessionId('s1');

    for (let i = 0; i < 5; i++) t.write(entry({ id: `e${i}` }));
    t.flush();

    // seqs 0,1 evicted; tail at 2; entries 2,3,4 remain
    expect(mmkv.contains('t:l:s1:0')).toBe(false);
    expect(mmkv.contains('t:l:s1:1')).toBe(false);
    expect(mmkv.contains('t:l:s1:2')).toBe(true);
    expect(mmkv.contains('t:l:s1:4')).toBe(true);
    expect(mmkv.getNumber('t:l:s1:meta:tail')).toBe(2);
  });

  it('getEntriesForSession returns only retained entries', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv, maxEntries: 3 });
    t.setSessionId('s1');

    for (let i = 0; i < 5; i++) t.write(entry({ id: `e${i}` }));

    const entries = t.getEntriesForSession('s1');
    expect(entries.map(e => e.id)).toEqual(['e2', 'e3', 'e4']);
  });
});

describe('MMKVTransport — getEntriesForSession', () => {
  it('returns [] for an unknown session', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    expect(t.getEntriesForSession('never-existed')).toEqual([]);
  });

  it('falls back to the active session id when no argument is supplied', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');
    t.write(entry({ id: 'a' }));

    expect(t.getEntriesForSession()).toHaveLength(1);
  });

  it('skips corrupted entries without throwing', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');
    t.write(entry({ id: 'a' }));
    t.write(entry({ id: 'b' }));
    t.flush(); // persist before corrupting, so the auto-flush on read can't overwrite
    // Corrupt the second entry (not-valid-json → parse-error, left in place + skipped)
    mmkv.set('t:l:s1:1', 'not-valid-json');

    const entries = t.getEntriesForSession('s1');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe('a');
  });
});

describe('MMKVTransport — clearSession', () => {
  it('removes every key prefixed by the session id', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');
    t.write(entry());
    t.write(entry());

    // Pre-condition: some s1 keys exist
    expect(mmkv.getAllKeys().some(k => k.startsWith('t:l:s1:'))).toBe(true);

    t.clearSession('s1');

    expect(mmkv.getAllKeys().some(k => k.startsWith('t:l:s1:'))).toBe(false);
  });
});

describe('MMKVTransport — minLevel + ITransport contract', () => {
  it('defaults minLevel to WARN', () => {
    const t = new MMKVTransport({ storage: new FakeMMKV() });
    expect(t.minLevel).toBe(LogLevel.WARN);
  });

  it('honours a custom minLevel', () => {
    const t = new MMKVTransport({ storage: new FakeMMKV(), minLevel: LogLevel.ERROR });
    expect(t.minLevel).toBe(LogLevel.ERROR);
  });

  it('exposes name "mmkv"', () => {
    expect(new MMKVTransport({ storage: new FakeMMKV() }).name).toBe('mmkv');
  });
});

// ─── D-7: byte budget, quarantine, encryptValue ───────────────────────────────

describe('MMKVTransport — byte budget', () => {
  it('evicts oldest entries to stay under maxBytesPerSession', () => {
    const mmkv = new FakeMMKV();
    // Tiny budget so a couple of entries blow it; high maxEntries so the count
    // cap doesn't interfere.
    const t = new MMKVTransport({ storage: mmkv, maxBytesPerSession: 200, maxEntries: 1000 });
    t.setSessionId('s1');

    // Each serialized entry is well over ~60 bytes; writing several exceeds 200.
    for (let i = 0; i < 10; i++) t.write(entry({ id: `e${i}`, message: 'x'.repeat(50) }));
    t.flush();

    const remaining = mmkv.getAllKeys().filter(k => /^t:l:s1:\d+$/.test(k));
    // Far fewer than 10 survive once the byte budget kicks in.
    expect(remaining.length).toBeLessThan(10);
    expect(remaining.length).toBeGreaterThan(0);
  });
});

describe('MMKVTransport — quarantine', () => {
  it('renames an unknown-version record out of the live range instead of dropping it', () => {
    const mmkv = new FakeMMKV();
    const t = new MMKVTransport({ storage: mmkv });
    t.setSessionId('s1');
    t.write(entry({ id: 'a' }));
    t.flush();

    // Forge a record with a future/unknown schema version at seq 1.
    mmkv.set('t:l:s1:meta:next', 2);
    mmkv.set('t:l:s1:1', JSON.stringify({ v: 999, payload: { id: 'future' } }));

    const entries = t.getEntriesForSession('s1');
    expect(entries.map(e => e.id)).toEqual(['a']);
    // The bad record is renamed, not deleted, and the live key is gone.
    expect(mmkv.contains('t:l:s1:1')).toBe(false);
    expect(mmkv.contains('t:l:s1:1:quarantine')).toBe(true);
  });
});

describe('MMKVTransport — encryptValue hook', () => {
  it('encrypts on write and decrypts on read (round-trip)', () => {
    const mmkv = new FakeMMKV();
    // Trivial reversible "cipher" — reverse the string — to prove the hook wires.
    const rev = (s: string) => s.split('').reverse().join('');
    const t = new MMKVTransport({
      storage: mmkv,
      encryptValue: rev,
      decryptValue: rev,
    });
    t.setSessionId('s1');
    t.write(entry({ id: 'secret', message: 'hello' }));
    t.flush();

    // Stored value is transformed (not plain JSON).
    const stored = mmkv.getString('t:l:s1:0')!;
    expect(stored.startsWith('{')).toBe(false);

    // Read path reverses it back.
    const entries = t.getEntriesForSession('s1');
    expect(entries[0]?.id).toBe('secret');
    expect(entries[0]?.message).toBe('hello');
  });
});
