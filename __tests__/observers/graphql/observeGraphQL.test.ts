import { observeGraphQL } from '../../../src/observers/graphql/observeGraphQL';
import { createHttpObserver } from '../../../src/integrations/http';

const globalScope = globalThis as unknown as { __DEV__: boolean | undefined };

beforeEach(() => {
  globalScope.__DEV__ = true;
});

describe('observeGraphQL', () => {
  it('records a successful operation as a network entry', async () => {
    const http = createHttpObserver();
    const executor = jest.fn().mockResolvedValue({ user: { id: '1' } });
    const request = observeGraphQL(executor, http, { url: 'https://api/graphql' });

    const data = await request('query GetUser { user { id } }', { id: '1' });

    expect(data).toEqual({ user: { id: '1' } });
    const entry = http.store.getSnapshot()[0];
    expect(entry?.source).toBe('graphql');
    expect(entry?.method).toBe('QUERY');
    expect(entry?.url).toBe('https://api/graphql#GetUser');
    expect(entry?.state).toBe('success');
    expect(entry?.statusCode).toBe(200);
    // Variables captured as the request body.
    expect(entry?.requestBody).toEqual({ id: '1' });
  });

  it('parses mutation and subscription operation types', async () => {
    const http = createHttpObserver();
    const request = observeGraphQL(jest.fn().mockResolvedValue({}), http);

    await request('mutation CreatePost { createPost { id } }');
    await request('subscription OnPost { postAdded { id } }');

    const snap = http.store.getSnapshot();
    expect(snap.find(e => e.url.endsWith('#CreatePost'))?.method).toBe('MUTATION');
    expect(snap.find(e => e.url.endsWith('#OnPost'))?.method).toBe('SUBSCRIPTION');
  });

  it('records an error and re-throws it unchanged', async () => {
    const http = createHttpObserver();
    const failure = Object.assign(new Error('Network error'), { response: { status: 503 } });
    const request = observeGraphQL(jest.fn().mockRejectedValue(failure), http);

    await expect(request('query Q { x }')).rejects.toBe(failure);

    const entry = http.store.getSnapshot()[0];
    expect(entry?.state).toBe('error');
    expect(entry?.statusCode).toBe(503);
    expect(entry?.error).toBe('Network error');
  });

  it('does not capture response data unless captureData is set', async () => {
    const http = createHttpObserver();
    const noCapture = observeGraphQL(jest.fn().mockResolvedValue({ secret: 1 }), http);
    await noCapture('query Q { x }');
    expect(http.store.getSnapshot()[0]?.responseBody).toBeUndefined();

    const http2 = createHttpObserver();
    const withCapture = observeGraphQL(jest.fn().mockResolvedValue({ ok: true }), http2, {
      captureData: true,
    });
    await withCapture('query Q { x }');
    expect(http2.store.getSnapshot()[0]?.responseBody).toEqual({ ok: true });
  });

  it('handles an anonymous (bare) operation', async () => {
    const http = createHttpObserver();
    const request = observeGraphQL(jest.fn().mockResolvedValue({}), http);
    await request('{ viewer { id } }');
    expect(http.store.getSnapshot()[0]?.url).toContain('#');
  });

  it('preserves the executor signature (variables passed through)', async () => {
    const http = createHttpObserver();
    const executor = jest.fn().mockResolvedValue({});
    const request = observeGraphQL(executor, http);
    await request('query Q($id: ID!) { user(id: $id) { id } }', { id: '42' });
    expect(executor).toHaveBeenCalledWith('query Q($id: ID!) { user(id: $id) { id } }', {
      id: '42',
    });
  });
});
