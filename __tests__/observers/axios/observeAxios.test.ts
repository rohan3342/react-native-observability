import { observeAxios } from '../../../src/observers/axios/observeAxios';
import { createHttpObserver } from '../../../src/integrations/http';

// Minimal fake Axios instance — captures interceptor functions for direct
// invocation without bringing axios into the test deps.

interface ReqInterceptor {
  (config: Record<string, unknown>): Record<string, unknown>;
}
interface ResInterceptor {
  fulfilled: (response: Record<string, unknown>) => Record<string, unknown>;
  rejected: (err: Record<string, unknown>) => Promise<never>;
}

function makeFakeAxios(): {
  instance: Parameters<typeof observeAxios>[0];
  request: { current: ReqInterceptor | null; ejected: boolean };
  response: { current: ResInterceptor | null; ejected: boolean };
} {
  const request = { current: null as ReqInterceptor | null, ejected: false };
  const response = { current: null as ResInterceptor | null, ejected: false };
  const instance = {
    interceptors: {
      request: {
        use: (fn: ReqInterceptor) => {
          request.current = fn;
          return 1;
        },
        eject: () => {
          request.ejected = true;
        },
      },
      response: {
        use: (fulfilled: ResInterceptor['fulfilled'], rejected: ResInterceptor['rejected']) => {
          response.current = { fulfilled, rejected };
          return 2;
        },
        eject: () => {
          response.ejected = true;
        },
      },
    },
  } as unknown as Parameters<typeof observeAxios>[0];
  return { instance, request, response };
}

const globalScope = globalThis as unknown as { __DEV__: boolean | undefined };
beforeEach(() => {
  globalScope.__DEV__ = true;
});

describe('observeAxios — pipeline', () => {
  it('records a pending entry on request, success on response', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    const config = { method: 'get', url: '/items', baseURL: 'https://api.example.com' };
    fake.request.current!(config);

    expect(http.store.getSnapshot()).toHaveLength(1);
    expect(http.store.getSnapshot()[0]?.state).toBe('pending');
    expect(http.store.getSnapshot()[0]?.url).toBe('https://api.example.com/items');
    expect(http.store.getSnapshot()[0]?.method).toBe('GET');

    fake.response.current!.fulfilled({ status: 200, data: { ok: true }, config });

    const e = http.store.getSnapshot()[0];
    expect(e?.state).toBe('success');
    expect(e?.statusCode).toBe(200);
    expect(e?.responseBody).toEqual({ ok: true });
  });

  it('records an error on a failing response', async () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    const config = { method: 'post', url: '/fail', baseURL: 'https://api.example.com' };
    fake.request.current!(config);

    await fake.response
      .current!.rejected({ message: 'Network Error', config, response: { status: 500 } })
      .catch(() => {});

    const e = http.store.getSnapshot()[0];
    expect(e?.state).toBe('error');
    expect(e?.statusCode).toBe(500);
    expect(e?.error).toBe('Network Error');
  });

  it('records a cancelled request (ERR_CANCELED) as cancelled, not error (API-2)', async () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    const config = { method: 'get', url: '/slow', baseURL: 'https://api.example.com' };
    fake.request.current!(config);

    await fake.response
      .current!.rejected({ message: 'canceled', code: 'ERR_CANCELED', config })
      .catch(() => {});

    expect(http.store.getSnapshot()[0]?.state).toBe('cancelled');
  });

  it('parses a string body as JSON', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    // Use a non-PII payload so this test stays focused on JSON parsing — the
    // default-on value-pattern redactors (email/JWT/CC) would otherwise scrub
    // recognizable PII. Redaction is covered in createHttpObserver tests.
    const config = { method: 'post', url: '/login', data: '{"role":"admin"}' };
    fake.request.current!(config);

    expect(http.store.getSnapshot()[0]?.requestBody).toEqual({ role: 'admin' });
  });

  it('keeps a non-JSON string body as the raw string', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    const config = { method: 'post', url: '/raw', data: 'plain-text' };
    fake.request.current!(config);

    expect(http.store.getSnapshot()[0]?.requestBody).toBe('plain-text');
  });

  it('builds URL with params', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    fake.request.current!({
      method: 'get',
      url: '/search',
      baseURL: 'https://api.example.com',
      params: { q: 'foo', page: '1' },
    });

    expect(http.store.getSnapshot()[0]?.url).toBe('https://api.example.com/search?q=foo&page=1');
  });

  it('returns a cleanup function that ejects both interceptors', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    const cleanup = observeAxios(fake.instance, http);

    cleanup();

    expect(fake.request.ejected).toBe(true);
    expect(fake.response.ejected).toBe(true);
  });

  it('forwards headers and source: xhr', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    fake.request.current!({
      method: 'get',
      url: '/x',
      headers: { 'X-Trace': 't1' },
    });

    const e = http.store.getSnapshot()[0];
    expect(e?.source).toBe('xhr');
    expect(e?.requestHeaders).toEqual({ 'X-Trace': 't1' });
  });

  it('handles a response for an un-tracked request gracefully', () => {
    const fake = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(fake.instance, http);

    // Response for a config that never went through the request interceptor
    const orphan = { status: 200, data: {}, config: { url: '/orphan' } };
    expect(() => fake.response.current!.fulfilled(orphan)).not.toThrow();
    expect(http.store.getSnapshot()).toHaveLength(0);
  });
});

describe('observeAxios — mock engine', () => {
  it('sets a synthetic adapter on a matched request', async () => {
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [
        {
          id: 'm',
          match: { url: '/orders' },
          action: { type: 'respond', status: 418, body: { teapot: true } },
        },
      ],
    });
    const { instance, request } = makeFakeAxios();
    const http = createHttpObserver();
    observeAxios(instance, http, { mock });

    const config: Record<string, unknown> = { method: 'get', url: '/orders' };
    request.current!(config);
    // The interceptor installed a per-request adapter for the synthetic response.
    expect(typeof config.adapter).toBe('function');
    const res = await (
      config.adapter as (c: unknown) => Promise<{ status: number; data: unknown }>
    )(config);
    expect(res.status).toBe(418);
    expect(res.data).toEqual({ teapot: true });
  });

  it('leaves the adapter untouched for unmatched requests', () => {
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [{ id: 'm', match: { url: '/other' }, action: { type: 'block' } }],
    });
    const { instance, request } = makeFakeAxios();
    observeAxios(instance, createHttpObserver(), { mock });
    const config: Record<string, unknown> = { method: 'get', url: '/items' };
    request.current!(config);
    expect(config.adapter).toBeUndefined();
  });

  it('a blocked request rejects via the synthetic adapter', async () => {
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [{ id: 'b', match: { url: '/ads' }, action: { type: 'block' } }],
    });
    const { instance, request } = makeFakeAxios();
    observeAxios(instance, createHttpObserver(), { mock });
    const config: Record<string, unknown> = { method: 'get', url: '/ads/1' };
    request.current!(config);
    await expect((config.adapter as (c: unknown) => Promise<unknown>)(config)).rejects.toThrow(
      /blocked by mock/
    );
  });
});
