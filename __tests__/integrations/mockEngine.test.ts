import { createMockEngine } from '../../src/integrations/http/mockEngine';
import type { MockRule } from '../../src/integrations/http/mockEngine';

// __DEV__ is true in the jest setup, so the engine is active by default.

function rule(over: Partial<MockRule> & Pick<MockRule, 'id' | 'match' | 'action'>): MockRule {
  return over;
}

describe('createMockEngine — matching', () => {
  it('matches by URL substring and returns a respond resolution', () => {
    const engine = createMockEngine({
      rules: [
        {
          id: 'r1',
          match: { url: '/orders' },
          action: { type: 'respond', status: 500, body: { error: 'boom' } },
        },
      ],
    });
    const res = engine.resolve({ method: 'GET', url: 'https://api.example.com/orders/42' });
    expect(res?.type).toBe('respond');
    if (res?.type === 'respond') {
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'boom' });
      expect(res.delayMs).toBe(0);
    }
  });

  it('defaults respond status to 200 and headers to {}', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r', match: {}, action: { type: 'respond' } }],
    });
    const res = engine.resolve({ method: 'GET', url: '/x' });
    expect(res?.type).toBe('respond');
    if (res?.type === 'respond') {
      expect(res.status).toBe(200);
      expect(res.headers).toEqual({});
    }
  });

  it('matches by method (case-insensitive) and skips on mismatch', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r', match: { method: 'post', url: '/x' }, action: { type: 'block' } }],
    });
    expect(engine.resolve({ method: 'POST', url: '/x' })?.type).toBe('block');
    expect(engine.resolve({ method: 'GET', url: '/x' })).toBeNull();
  });

  it('supports glob URL patterns', () => {
    const engine = createMockEngine({
      rules: [{ id: 'ads', match: { url: '**/ads/**' }, action: { type: 'block' } }],
    });
    expect(engine.resolve({ method: 'GET', url: 'https://x.com/v1/ads/banner' })?.type).toBe(
      'block'
    );
    expect(engine.resolve({ method: 'GET', url: 'https://x.com/v1/posts' })).toBeNull();
  });

  it('supports RegExp URL patterns', () => {
    const engine = createMockEngine({
      rules: [{ id: 're', match: { url: /\/users\/\d+$/ }, action: { type: 'block' } }],
    });
    expect(engine.resolve({ method: 'GET', url: '/users/7' })?.type).toBe('block');
    expect(engine.resolve({ method: 'GET', url: '/users/me' })).toBeNull();
  });

  it('a match with no url/method matches every request', () => {
    const engine = createMockEngine({
      rules: [{ id: 'all', match: {}, action: { type: 'block' } }],
    });
    expect(engine.resolve({ method: 'DELETE', url: 'anything' })?.type).toBe('block');
  });

  it('skips disabled rules', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r', enabled: false, match: { url: '/x' }, action: { type: 'block' } }],
    });
    expect(engine.resolve({ method: 'GET', url: '/x' })).toBeNull();
  });

  it('uses the FIRST matching rule (order = precedence)', () => {
    const engine = createMockEngine({
      rules: [
        { id: 'first', match: { url: '/x' }, action: { type: 'respond', status: 201 } },
        { id: 'second', match: { url: '/x' }, action: { type: 'respond', status: 500 } },
      ],
    });
    const res = engine.resolve({ method: 'GET', url: '/x' });
    expect(res?.rule.id).toBe('first');
  });
});

describe('createMockEngine — CRUD', () => {
  it('add / remove / update / setRules mutate the rule list', () => {
    const engine = createMockEngine();
    engine.addRule(rule({ id: 'a', match: { url: '/a' }, action: { type: 'block' } }));
    expect(engine.getRules().map(r => r.id)).toEqual(['a']);

    engine.updateRule('a', { enabled: false });
    expect(engine.getRules()[0]?.enabled).toBe(false);

    engine.addRule(rule({ id: 'b', match: { url: '/b' }, action: { type: 'block' } }));
    engine.removeRule('a');
    expect(engine.getRules().map(r => r.id)).toEqual(['b']);

    engine.setRules([]);
    expect(engine.getRules()).toEqual([]);
  });

  it('getRules returns a copy (external mutation is ignored)', () => {
    const engine = createMockEngine({ rules: [{ id: 'a', match: {}, action: { type: 'block' } }] });
    engine.getRules().push(rule({ id: 'x', match: {}, action: { type: 'block' } }));
    expect(engine.getRules().map(r => r.id)).toEqual(['a']);
  });
});

describe('createMockEngine — production gating', () => {
  const g = globalThis as { __DEV__?: boolean | undefined };
  const realDev = g.__DEV__;
  afterEach(() => {
    g.__DEV__ = realDev;
  });

  it('is inactive (resolve → null) in production by default', () => {
    g.__DEV__ = false;
    const engine = createMockEngine({ rules: [{ id: 'a', match: {}, action: { type: 'block' } }] });
    expect(engine.active).toBe(false);
    expect(engine.resolve({ method: 'GET', url: '/x' })).toBeNull();
  });

  it('can be force-enabled in production with a loud warning', () => {
    g.__DEV__ = false;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const engine = createMockEngine({
      allowInProduction: true,
      rules: [{ id: 'a', match: {}, action: { type: 'block' } }],
    });
    expect(engine.active).toBe(true);
    expect(engine.resolve({ method: 'GET', url: '/x' })?.type).toBe('block');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ACTIVE IN PRODUCTION'));
    warn.mockRestore();
  });
});

describe('createMockEngine — modifyRequest', () => {
  it('mutates method/url/body and patches headers, then proceeds', () => {
    const engine = createMockEngine({
      rules: [
        {
          id: 'm',
          match: { url: '/orders' },
          action: {
            type: 'modifyRequest',
            method: 'POST',
            url: 'https://api.example.com/orders/override',
            headers: { set: { 'X-Test': '1' }, remove: ['authorization'] },
            body: { mutated: true },
          },
        },
      ],
    });
    const res = engine.resolve({
      method: 'GET',
      url: 'https://api.example.com/orders/42',
      headers: { Authorization: 'secret', Accept: 'json' },
      body: { original: true },
    });
    expect(res?.type).toBe('modifyRequest');
    if (res?.type === 'modifyRequest') {
      expect(res.request.method).toBe('POST');
      expect(res.request.url).toBe('https://api.example.com/orders/override');
      expect(res.request.body).toEqual({ mutated: true });
      expect(res.request.headers).toEqual({ Accept: 'json', 'X-Test': '1' }); // Authorization removed
    }
  });

  it('keeps original fields when the action omits them', () => {
    const engine = createMockEngine({
      rules: [
        { id: 'm', match: {}, action: { type: 'modifyRequest', headers: { set: { A: '1' } } } },
      ],
    });
    const res = engine.resolve({ method: 'PUT', url: '/x', body: { keep: 1 } });
    if (res?.type === 'modifyRequest') {
      expect(res.request.method).toBe('PUT');
      expect(res.request.url).toBe('/x');
      expect(res.request.body).toEqual({ keep: 1 });
      expect(res.request.headers).toEqual({ A: '1' });
    }
  });
});

describe('createMockEngine — modifyResponse (response phase)', () => {
  it('is NOT returned by resolve() (request phase) — request proceeds', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r', match: { url: '/x' }, action: { type: 'modifyResponse', status: 503 } }],
    });
    expect(engine.resolve({ method: 'GET', url: '/x' })).toBeNull();
  });

  it('overrides status/body and patches headers in resolveResponse()', () => {
    const engine = createMockEngine({
      rules: [
        {
          id: 'r',
          match: { url: '/x' },
          action: {
            type: 'modifyResponse',
            status: 503,
            body: { forced: true },
            headers: { set: { 'X-Mock': 'yes' } },
          },
        },
      ],
    });
    const res = engine.resolveResponse(
      { method: 'GET', url: '/x' },
      { status: 200, headers: { 'content-type': 'json' }, body: { real: true } }
    );
    expect(res?.type).toBe('modifyResponse');
    if (res?.type === 'modifyResponse') {
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ forced: true });
      expect(res.headers).toEqual({ 'content-type': 'json', 'X-Mock': 'yes' });
    }
  });

  it('keeps the real status/body when the action omits them', () => {
    const engine = createMockEngine({
      rules: [
        { id: 'r', match: {}, action: { type: 'modifyResponse', headers: { set: { A: '1' } } } },
      ],
    });
    const res = engine.resolveResponse(
      { method: 'GET', url: '/x' },
      { status: 201, body: { real: 1 } }
    );
    if (res?.type === 'modifyResponse') {
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ real: 1 });
    }
  });

  it('returns null when no modifyResponse rule matches', () => {
    const engine = createMockEngine({ rules: [] });
    expect(engine.resolveResponse({ method: 'GET', url: '/x' }, { status: 200 })).toBeNull();
  });
});

describe('createMockEngine — fault injection', () => {
  it('returns a networkError fault', () => {
    const engine = createMockEngine({
      rules: [{ id: 'f', match: { url: '/x' }, action: { type: 'fault', kind: 'networkError' } }],
    });
    const res = engine.resolve({ method: 'GET', url: '/x' });
    expect(res?.type).toBe('fault');
    if (res?.type === 'fault') {
      expect(res.kind).toBe('networkError');
      expect(res.delayMs).toBe(0);
    }
  });

  it('returns a timeout fault with a default delay', () => {
    const engine = createMockEngine({
      rules: [{ id: 'f', match: {}, action: { type: 'fault', kind: 'timeout' } }],
    });
    const res = engine.resolve({ method: 'GET', url: '/x' });
    if (res?.type === 'fault') {
      expect(res.kind).toBe('timeout');
      expect(res.delayMs).toBe(30_000);
    }
  });

  it('everyN=3 injects only on every 3rd match (passes through otherwise)', () => {
    const engine = createMockEngine({
      rules: [{ id: 'f', match: {}, action: { type: 'fault', kind: 'networkError', everyN: 3 } }],
    });
    const req = { method: 'GET', url: '/x' };
    expect(engine.resolve(req)).toBeNull(); // 1
    expect(engine.resolve(req)).toBeNull(); // 2
    expect(engine.resolve(req)?.type).toBe('fault'); // 3 → fault
    expect(engine.resolve(req)).toBeNull(); // 4
  });
});
