import {
  formatBody,
  formatHeaders,
  formatNetworkExport,
  formatNetworkExportAll,
} from '../../src/panel/tabs/networkExport';
import type { NetworkLogEntry } from '../../src/integrations/http';

function makeEntry(overrides: Partial<NetworkLogEntry> = {}): NetworkLogEntry {
  return {
    id: 'x',
    timestamp: 1700000000000,
    method: 'POST',
    url: 'https://api.example.com/users',
    source: 'xhr',
    state: 'success',
    statusCode: 201,
    durationMs: 142,
    requestHeaders: { Authorization: '[REDACTED]', Accept: 'application/json' },
    requestBody: { name: 'Ada' },
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: { id: 42, name: 'Ada' },
    toCurl: () => "curl -X POST 'https://api.example.com/users'",
    ...overrides,
  };
}

/** A minimal entry with no optional fields set (avoids passing `undefined`,
 * which `exactOptionalPropertyTypes` rejects). */
function minimalEntry(overrides: Partial<NetworkLogEntry> = {}): NetworkLogEntry {
  return {
    id: 'm',
    timestamp: 1700000000000,
    method: 'GET',
    url: 'https://api.example.com/ping',
    source: 'xhr',
    state: 'success',
    toCurl: () => "curl 'https://api.example.com/ping'",
    ...overrides,
  };
}

describe('formatBody', () => {
  it('returns strings unchanged', () => {
    expect(formatBody('raw text')).toBe('raw text');
  });

  it('pretty-prints objects', () => {
    expect(formatBody({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('falls back to String() for non-serializable values', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => formatBody(circular)).not.toThrow();
  });
});

describe('formatHeaders', () => {
  it('returns empty string for undefined', () => {
    expect(formatHeaders(undefined)).toBe('');
  });

  it('formats and sorts headers as Key: value lines', () => {
    expect(formatHeaders({ B: '2', A: '1' })).toBe('A: 1\nB: 2');
  });
});

describe('formatNetworkExport', () => {
  it('includes request line, status, headers, bodies, and cURL', () => {
    const out = formatNetworkExport(makeEntry());
    expect(out).toContain('POST https://api.example.com/users');
    expect(out).toContain('Status: 201');
    expect(out).toContain('Duration: 142ms');
    expect(out).toContain('── Request Headers ──');
    expect(out).toContain('Authorization: [REDACTED]');
    expect(out).toContain('── Request Body ──');
    expect(out).toContain('── Response Headers ──');
    expect(out).toContain('── Response Body ──');
    expect(out).toContain('── cURL ──');
    expect(out).toContain("curl -X POST 'https://api.example.com/users'");
  });

  it('includes an error section when the request failed', () => {
    const out = formatNetworkExport(minimalEntry({ state: 'error', error: 'Network timeout' }));
    expect(out).toContain('Status: error');
    expect(out).toContain('── Error ──');
    expect(out).toContain('Network timeout');
  });

  it('omits absent sections', () => {
    const out = formatNetworkExport(minimalEntry());
    expect(out).not.toContain('── Request Headers ──');
    expect(out).not.toContain('── Response Body ──');
    expect(out).toContain('── cURL ──'); // cURL always present
  });

  it('reports pending state', () => {
    const out = formatNetworkExport(minimalEntry({ state: 'pending' }));
    expect(out).toContain('Status: pending');
  });

  it('includes the screen when present (T5-1)', () => {
    const out = formatNetworkExport(minimalEntry({ screen: 'Checkout' }));
    expect(out).toContain('Screen: Checkout');
  });

  it('omits the screen line when absent', () => {
    const out = formatNetworkExport(minimalEntry());
    expect(out).not.toContain('Screen:');
  });
});

describe('formatNetworkExportAll (T5-3)', () => {
  const GENERATED_AT = 1700000000000;

  it('returns a notice when there are no entries', () => {
    expect(formatNetworkExportAll([], GENERATED_AT)).toBe('No network requests captured.');
  });

  it('includes a header with the request count and generated timestamp', () => {
    const out = formatNetworkExportAll([minimalEntry()], GENERATED_AT);
    expect(out).toContain('Observability network export — 1 request');
    expect(out).toContain(`Generated: ${new Date(GENERATED_AT).toISOString()}`);
  });

  it('pluralises the request count', () => {
    const out = formatNetworkExportAll([minimalEntry({ id: 'a' }), minimalEntry({ id: 'b' })], 0);
    expect(out).toContain('2 requests');
  });

  it('concatenates every entry with a numbered separator, newest first', () => {
    const a = minimalEntry({ id: 'a', url: 'https://api.example.com/first' });
    const b = minimalEntry({ id: 'b', url: 'https://api.example.com/second' });
    const out = formatNetworkExportAll([a, b], GENERATED_AT);

    expect(out).toContain('# 1 of 2');
    expect(out).toContain('# 2 of 2');
    expect(out).toContain('/first');
    expect(out).toContain('/second');
    // Newest first: `b` (last in input) should appear before `a`.
    expect(out.indexOf('/second')).toBeLessThan(out.indexOf('/first'));
  });

  it('reuses the single-entry format for each block (headers, bodies, cURL)', () => {
    const out = formatNetworkExportAll([makeEntry()], GENERATED_AT);
    expect(out).toContain('POST https://api.example.com/users');
    expect(out).toContain('── cURL ──');
    expect(out).toContain('── Response Body ──');
  });
});
