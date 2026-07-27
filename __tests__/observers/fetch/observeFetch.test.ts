import { observeFetch } from '../../../src/observers/fetch/observeFetch';
import { createHttpObserver } from '../../../src/integrations/http';

const globalScope = globalThis as unknown as {
  __DEV__: boolean | undefined;
  fetch: typeof fetch;
};
let originalFetch: typeof fetch;

beforeEach(() => {
  globalScope.__DEV__ = true;
  originalFetch = globalScope.fetch;
});
afterEach(() => {
  globalScope.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('observeFetch — pipeline', () => {
  it('captures a successful request/response pair', async () => {
    globalScope.fetch = jest.fn().mockResolvedValue(jsonResponse({ ok: true })) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    const res = await globalScope.fetch('https://api.example.com/items');
    expect(res.status).toBe(200);

    const entry = http.store.getSnapshot()[0];
    expect(entry?.state).toBe('success');
    expect(entry?.method).toBe('GET');
    expect(entry?.url).toBe('https://api.example.com/items');
    expect(entry?.statusCode).toBe(200);
    expect(entry?.responseBody).toEqual({ ok: true });
    expect(entry?.source).toBe('fetch');
  });

  it('captures errors and re-throws unchanged', async () => {
    const networkError = new Error('Network error');
    globalScope.fetch = jest.fn().mockRejectedValue(networkError) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    await expect(globalScope.fetch('https://api.example.com/fail')).rejects.toBe(networkError);

    const entry = http.store.getSnapshot()[0];
    expect(entry?.state).toBe('error');
    expect(entry?.error).toBe('Network error');
  });

  it('does not consume the response body — consumer .json() still works', async () => {
    globalScope.fetch = jest.fn().mockResolvedValue(jsonResponse({ a: 1 })) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    const res = await globalScope.fetch('https://api.example.com/items');
    const body = await res.json();
    expect(body).toEqual({ a: 1 });
  });

  it('captures the JSON request body when init.body is a JSON string', async () => {
    globalScope.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    // Non-PII payload keeps this test focused on JSON body capture; the
    // default-on value-pattern redactors would scrub a real email.
    await globalScope.fetch('https://api.example.com/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'admin' }),
      headers: { 'Content-Type': 'application/json' },
    });

    const entry = http.store.getSnapshot()[0];
    expect(entry?.method).toBe('POST');
    expect(entry?.requestBody).toEqual({ role: 'admin' });
    expect(entry?.requestHeaders).toEqual({ 'Content-Type': 'application/json' });
  });

  it('does NOT capture non-string bodies (FormData, Blob, etc.)', async () => {
    globalScope.fetch = jest.fn().mockResolvedValue(jsonResponse({})) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    // Use any non-string BodyInit-compatible value; URLSearchParams is the
    // canonical example. Cast to keep the test platform-agnostic — RN narrows
    // BodyInit differently than lib.dom.d.ts.
    const form = new URLSearchParams({ k: 'v' });

    await globalScope.fetch('https://api.example.com/form', { method: 'POST', body: form as any });

    const entry = http.store.getSnapshot()[0];
    expect(entry?.requestBody).toBeUndefined();
  });

  it('respects responseBodyContentTypes — does not read non-JSON bodies', async () => {
    const htmlResponse = new Response('<html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    globalScope.fetch = jest.fn().mockResolvedValue(htmlResponse) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http); // default allow list is ['application/json']

    await globalScope.fetch('https://example.com/page');

    const entry = http.store.getSnapshot()[0];
    expect(entry?.state).toBe('success');
    expect(entry?.statusCode).toBe(200);
    expect(entry?.responseBody).toBeUndefined();
  });

  it('matches content-type case-insensitively and with charset suffix', async () => {
    const res = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'Application/JSON; charset=utf-8' },
    });
    globalScope.fetch = jest.fn().mockResolvedValue(res) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    await globalScope.fetch('https://example.com/api');
    expect(http.store.getSnapshot()[0]?.responseBody).toEqual({ ok: true });
  });

  it('captures no body when responseBodyContentTypes is []', async () => {
    globalScope.fetch = jest.fn().mockResolvedValue(jsonResponse({ ok: true })) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http, { responseBodyContentTypes: [] });

    await globalScope.fetch('https://example.com/api');
    expect(http.store.getSnapshot()[0]?.responseBody).toBeUndefined();
  });
});

describe('observeFetch — install/restore semantics', () => {
  it('restore() reinstalls the original fetch', () => {
    const original = jest.fn() as unknown as typeof fetch;
    globalScope.fetch = original;
    const http = createHttpObserver();

    const restore = observeFetch(http);
    expect(globalScope.fetch).not.toBe(original);

    restore();
    expect(globalScope.fetch).toBe(original);
  });

  it('restore() is a safe no-op when a foreign wrapper has replaced our patch', () => {
    const original = jest.fn() as unknown as typeof fetch;
    globalScope.fetch = original;
    const http = createHttpObserver();

    const restore = observeFetch(http);
    const foreign = jest.fn() as unknown as typeof fetch;
    globalScope.fetch = foreign; // simulate someone wrapping on top

    restore();
    expect(globalScope.fetch).toBe(foreign); // we did not clobber it
  });

  it('observeFetch is a no-op when globalThis.fetch is undefined', () => {
    // Treat fetch as absent
    (globalScope as { fetch: typeof fetch | undefined }).fetch =
      undefined as unknown as typeof fetch;
    const http = createHttpObserver();
    const restore = observeFetch(http);
    expect(restore).toBeInstanceOf(Function);
    restore(); // no throw
  });
});

describe('observeFetch — mock engine', () => {
  it('responds with a synthetic response without hitting the network', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({ real: true }));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [
        {
          id: 'm',
          match: { url: '/items' },
          action: { type: 'respond', status: 503, body: { mocked: true } },
        },
      ],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    const res = await globalScope.fetch('https://api.example.com/items');
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ mocked: true });
    expect(realFetch).not.toHaveBeenCalled(); // network never touched

    const entry = http.store.getSnapshot()[0];
    expect(entry?.statusCode).toBe(503);
    expect(entry?.responseBody).toEqual({ mocked: true });
  });

  it('blocks a matched request (rejects) and records the error', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({}));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [{ id: 'b', match: { url: '/ads' }, action: { type: 'block' } }],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    await expect(globalScope.fetch('https://api.example.com/ads/1')).rejects.toThrow(
      /blocked by mock/
    );
    expect(realFetch).not.toHaveBeenCalled();
    expect(http.store.getSnapshot()[0]?.state).toBe('error');
  });

  it('passes through unmatched requests to the real fetch', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({ real: true }));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [{ id: 'm', match: { url: '/other' }, action: { type: 'block' } }],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    const res = await globalScope.fetch('https://api.example.com/items');
    expect(await res.json()).toEqual({ real: true });
    expect(realFetch).toHaveBeenCalledTimes(1);
  });

  it('modifyRequest rewrites the outgoing request, then hits the real fetch', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({ real: true }));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [
        {
          id: 'mr',
          match: { url: '/items' },
          action: {
            type: 'modifyRequest',
            method: 'POST',
            url: 'https://api.example.com/items/override',
            headers: { set: { 'X-Mock': '1' } },
            body: { injected: true },
          },
        },
      ],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    await globalScope.fetch('https://api.example.com/items');
    expect(realFetch).toHaveBeenCalledTimes(1);
    const [calledInput, calledInit] = realFetch.mock.calls[0];
    expect(calledInput).toBe('https://api.example.com/items/override');
    expect(calledInit.method).toBe('POST');
    // An object body is JSON-serialized (not sent as "[object Object]") and a
    // default JSON Content-Type is added when the rule didn't set one (API-3).
    expect(calledInit.body).toBe(JSON.stringify({ injected: true }));
    expect(calledInit.headers).toEqual({ 'X-Mock': '1', 'Content-Type': 'application/json' });
  });

  it('modifyRequest passes a string body through unchanged (API-3)', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({}));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [
        {
          id: 'mr-str',
          match: { url: '/items' },
          action: { type: 'modifyRequest', body: 'raw=1' },
        },
      ],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    await globalScope.fetch('https://api.example.com/items');
    expect(realFetch.mock.calls[0][1].body).toBe('raw=1');
  });

  it('records an aborted fetch as cancelled, not error (API-2)', async () => {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    globalScope.fetch = jest.fn().mockRejectedValue(abortErr) as typeof fetch;
    const http = createHttpObserver();
    observeFetch(http);

    await expect(globalScope.fetch('https://api.example.com/slow')).rejects.toBe(abortErr);
    expect(http.store.getSnapshot()[0]?.state).toBe('cancelled');
  });

  it('fault (networkError) rejects without hitting the network', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({}));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [
        { id: 'f', match: { url: '/items' }, action: { type: 'fault', kind: 'networkError' } },
      ],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    await expect(globalScope.fetch('https://api.example.com/items')).rejects.toThrow(
      /networkError injected/
    );
    expect(realFetch).not.toHaveBeenCalled();
    expect(http.store.getSnapshot()[0]?.state).toBe('error');
  });

  it('modifyResponse overrides the real response status/body', async () => {
    const realFetch = jest.fn().mockResolvedValue(jsonResponse({ real: true }, 200));
    globalScope.fetch = realFetch as typeof fetch;
    const { createMockEngine } =
      require('../../../src/integrations/http') as typeof import('../../../src/integrations/http');
    const mock = createMockEngine({
      rules: [
        {
          id: 'rr',
          match: { url: '/items' },
          action: { type: 'modifyResponse', status: 503, body: { forced: true } },
        },
      ],
    });
    const http = createHttpObserver();
    observeFetch(http, { mock });

    const res = await globalScope.fetch('https://api.example.com/items');
    expect(realFetch).toHaveBeenCalledTimes(1); // real request DID happen
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ forced: true });
    const entry = http.store.getSnapshot()[0];
    expect(entry?.statusCode).toBe(503);
    expect(entry?.responseBody).toEqual({ forced: true });
  });
});
