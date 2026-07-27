jest.mock('react-native', () => ({}));

import { aggregateEndpoints, normaliseEndpoint } from '../../src/panel/tabs/networkPerf';
import type { NetworkLogEntry } from '../../src/integrations/http';

// `over` is loosely typed so a test can request `statusCode: undefined`
// (omitted from the result) without tripping exactOptionalPropertyTypes.
function entry(over: Record<string, unknown> = {}): NetworkLogEntry {
  const merged: NetworkLogEntry = {
    id: `id-${Math.random()}`,
    timestamp: 0,
    method: 'GET',
    url: 'https://api.example.com/users/1',
    source: 'xhr',
    state: 'success',
    statusCode: 200,
    durationMs: 100,
    toCurl: () => '',
    ...(over as Partial<NetworkLogEntry>),
  };
  if ('statusCode' in over && over.statusCode === undefined) {
    delete (merged as { statusCode?: number }).statusCode;
  }
  return merged;
}

describe('normaliseEndpoint', () => {
  it('drops origin + query and templatises numeric ids', () => {
    expect(normaliseEndpoint('https://api.example.com/users/42?x=1')).toBe('/users/:id');
  });
  it('templatises uuid and long-hex segments', () => {
    expect(normaliseEndpoint('/u/123e4567-e89b-12d3-a456-426614174000/profile')).toBe(
      '/u/:id/profile'
    );
    expect(normaliseEndpoint('/obj/a1b2c3d4e5f60718')).toBe('/obj/:id');
  });
  it('keeps a relative path with no host', () => {
    expect(normaliseEndpoint('/api/orders')).toBe('/api/orders');
  });
});

describe('aggregateEndpoints', () => {
  it('groups same-route requests and computes count + percentiles', () => {
    const entries = [
      entry({ url: '/users/1', durationMs: 100 }),
      entry({ url: '/users/2', durationMs: 200 }),
      entry({ url: '/users/3', durationMs: 300 }),
    ];
    const stats = aggregateEndpoints(entries);
    expect(stats).toHaveLength(1);
    expect(stats[0]?.endpoint).toBe('GET /users/:id');
    expect(stats[0]?.count).toBe(3);
    expect(stats[0]?.p50).toBe(200);
    expect(stats[0]?.max).toBe(300);
  });

  it('computes error rate from error state or status >= 400', () => {
    const entries = [
      entry({ durationMs: 100, state: 'success', statusCode: 200 }),
      entry({ durationMs: 100, state: 'error', statusCode: undefined }),
      entry({ durationMs: 100, state: 'success', statusCode: 500 }),
      entry({ durationMs: 100, state: 'success', statusCode: 404 }),
    ];
    const stats = aggregateEndpoints(entries);
    expect(stats[0]?.errorRate).toBeCloseTo(0.75, 5);
  });

  it('ignores pending entries (no duration)', () => {
    const stats = aggregateEndpoints([entry({ state: 'pending', durationMs: undefined })]);
    expect(stats).toHaveLength(0);
  });

  it('separates different methods', () => {
    const stats = aggregateEndpoints([
      entry({ method: 'GET', url: '/x', durationMs: 10 }),
      entry({ method: 'POST', url: '/x', durationMs: 20 }),
    ]);
    expect(stats.map(s => s.endpoint).sort()).toEqual(['GET /x', 'POST /x']);
  });

  it('sorts slowest p95 first', () => {
    const stats = aggregateEndpoints([
      entry({ url: '/fast', durationMs: 10 }),
      entry({ url: '/slow', durationMs: 1000 }),
    ]);
    expect(stats[0]?.endpoint).toBe('GET /slow');
  });
});
