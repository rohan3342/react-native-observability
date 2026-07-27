import { formatRelativeTime } from '../../src/panel/util/time';
import { diffValues } from '../../src/panel/util/diff';
import { splitHighlight } from '../../src/panel/util/highlight';
import { formatSessionExport } from '../../src/panel/tabs/sessionExport';
import type { LogEntry } from '../../src/logger/types';
import { LogLevel } from '../../src/logger/types';
import type { NetworkLogEntry } from '../../src/integrations/http';

describe('formatRelativeTime', () => {
  const now = 1_000_000_000;
  it('renders sub-minute, minute, hour, day buckets', () => {
    expect(formatRelativeTime(now, now)).toBe('now');
    expect(formatRelativeTime(now - 5_000, now)).toBe('5s');
    expect(formatRelativeTime(now - 3 * 60_000, now)).toBe('3m');
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe('2h');
    expect(formatRelativeTime(now - 4 * 86_400_000, now)).toBe('4d');
  });
  it('treats future timestamps as "now"', () => {
    expect(formatRelativeTime(now + 5000, now)).toBe('now');
  });
});

describe('splitHighlight', () => {
  it('returns a single non-hit segment for empty query', () => {
    expect(splitHighlight('hello', '')).toEqual([{ s: 'hello', hit: false }]);
  });
  it('splits around case-insensitive matches', () => {
    expect(splitHighlight('Hello World', 'o')).toEqual([
      { s: 'Hell', hit: false },
      { s: 'o', hit: true },
      { s: ' W', hit: false },
      { s: 'o', hit: true },
      { s: 'rld', hit: false },
    ]);
  });
  it('handles a match at the start', () => {
    expect(splitHighlight('abc', 'ab')).toEqual([
      { s: 'ab', hit: true },
      { s: 'c', hit: false },
    ]);
  });
  it('returns whole string when no match', () => {
    expect(splitHighlight('abc', 'z')).toEqual([{ s: 'abc', hit: false }]);
  });
});

describe('diffValues', () => {
  it('reports added / removed / changed keys', () => {
    const d = diffValues({ a: 1, b: 2, c: 3 }, { a: 1, b: 99, d: 4 });
    expect(d.changed).toBe(true);
    const byKey = Object.fromEntries(d.entries.map(e => [e.key, e.kind]));
    expect(byKey).toEqual({ b: 'changed', c: 'removed', d: 'added' });
  });
  it('reports no change for equal objects', () => {
    expect(diffValues({ a: 1 }, { a: 1 }).changed).toBe(false);
  });
  it('handles non-object values as a single synthetic change', () => {
    const d = diffValues(1, 2);
    expect(d.changed).toBe(true);
    expect(d.entries[0]?.key).toBe('(value)');
  });
  it('does not throw on circular values', () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => diffValues(a, { x: 1 })).not.toThrow();
  });
});

describe('formatSessionExport', () => {
  const log: LogEntry = {
    id: 'l1',
    timestamp: 1700000000000,
    level: LogLevel.INFO,
    namespace: 'app',
    message: 'hello',
  };
  const net: NetworkLogEntry = {
    id: 'n1',
    timestamp: 1700000000000,
    method: 'GET',
    url: 'https://api/x',
    source: 'xhr',
    state: 'success',
    statusCode: 200,
    toCurl: () => "curl 'https://api/x'",
  };

  it('bundles version, session, logs, network and state', () => {
    const out = formatSessionExport({
      sessionId: 'sess-1',
      version: '0.2.0',
      generatedAt: 1700000000000,
      logs: [log],
      network: [net],
      state: { user: { id: 1 } },
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.observability).toBe('0.2.0');
    expect(parsed.sessionId).toBe('sess-1');
    expect(Array.isArray(parsed.logs)).toBe(true);
    expect(Array.isArray(parsed.network)).toBe(true);
    expect(parsed.state).toEqual({ user: { id: 1 } });
    // toCurl closure is flattened away (not serialised as a function).
    expect(out).not.toContain('toCurl');
  });

  it('omits absent sections', () => {
    const out = formatSessionExport({ version: '0.2.0', generatedAt: 0 });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.logs).toBeUndefined();
    expect(parsed.network).toBeUndefined();
    expect(parsed.state).toBeUndefined();
  });

  it('never throws on circular state', () => {
    const s: Record<string, unknown> = {};
    s.self = s;
    expect(() => formatSessionExport({ generatedAt: 0, state: s })).not.toThrow();
  });
});
