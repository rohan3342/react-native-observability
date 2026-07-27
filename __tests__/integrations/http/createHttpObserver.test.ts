import { createHttpObserver } from '../../../src/integrations/http/createHttpObserver';
import { NetworkLogStore } from '../../../src/integrations/http/NetworkLogStore';
import { Logger } from '../../../src/logger/Logger';
import { LogLevel } from '../../../src/logger/types';
import type { HttpEventStart } from '../../../src/integrations/http/types';

const globalScope = globalThis as unknown as { __DEV__: boolean | undefined };
const originalDev = globalScope.__DEV__;
beforeEach(() => {
  globalScope.__DEV__ = true;
});
afterEach(() => {
  globalScope.__DEV__ = originalDev;
});

function start(overrides: Partial<HttpEventStart> = {}): HttpEventStart {
  return {
    id: 'r1',
    ts: 100,
    method: 'GET',
    url: 'https://api.example.com/items',
    ...overrides,
  };
}

describe('createHttpObserver — pipeline', () => {
  it('records a pending entry on onStart', () => {
    const http = createHttpObserver();
    http.onStart(start());
    const entries = http.store.getSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.state).toBe('pending');
    expect(entries[0]?.method).toBe('GET');
  });

  it('patches the entry to success on a successful onEnd', () => {
    const http = createHttpObserver();
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 25, status: 200, responseBody: { ok: true } });

    const entry = http.store.getSnapshot()[0];
    expect(entry?.state).toBe('success');
    expect(entry?.statusCode).toBe(200);
    expect(entry?.durationMs).toBe(25);
    expect(entry?.responseBody).toEqual({ ok: true });
  });

  it('patches the entry to error on a failing onEnd', () => {
    const http = createHttpObserver();
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 1000, error: new Error('timeout') });

    const entry = http.store.getSnapshot()[0];
    expect(entry?.state).toBe('error');
    expect(entry?.error).toBe('timeout');
  });

  it('uses the supplied store when provided', () => {
    const store = new NetworkLogStore();
    const http = createHttpObserver({ store });
    http.onStart(start());
    expect(store.getSnapshot()).toHaveLength(1);
    expect(http.store).toBe(store);
  });
});

describe('createHttpObserver — redaction', () => {
  it('redacts header values matched case-insensitively', () => {
    const http = createHttpObserver({ redact: { headerKeys: ['Authorization'] } });
    http.onStart(
      start({
        headers: { authorization: 'Bearer abc', 'x-keep': 'v' },
      })
    );

    const entry = http.store.getSnapshot()[0];
    expect(entry?.requestHeaders?.['authorization']).toBe('[REDACTED]');
    expect(entry?.requestHeaders?.['x-keep']).toBe('v');
  });

  it('redacts the default sensitive headers out of the box (SEC-3)', () => {
    const http = createHttpObserver(); // no redact config
    http.onStart(
      start({
        headers: { Authorization: 'Bearer abc', Cookie: 'sid=1', 'x-api-key': 'k', accept: 'json' },
      })
    );
    const h = http.store.getSnapshot()[0]?.requestHeaders;
    expect(h?.['Authorization']).toBe('[REDACTED]');
    expect(h?.['Cookie']).toBe('[REDACTED]');
    expect(h?.['x-api-key']).toBe('[REDACTED]');
    expect(h?.['accept']).toBe('json');
  });

  it('consumer headerKeys extend (not replace) the default set (SEC-3)', () => {
    const http = createHttpObserver({ redact: { headerKeys: ['x-session-id'] } });
    http.onStart(start({ headers: { Authorization: 'Bearer abc', 'x-session-id': 's' } }));
    const h = http.store.getSnapshot()[0]?.requestHeaders;
    expect(h?.['Authorization']).toBe('[REDACTED]'); // still default-redacted
    expect(h?.['x-session-id']).toBe('[REDACTED]'); // plus the custom one
  });

  it('redactDefaultHeaders:false disables the built-in set (SEC-3)', () => {
    const http = createHttpObserver({ redact: { redactDefaultHeaders: false } });
    http.onStart(start({ headers: { Authorization: 'Bearer abc' } }));
    expect(http.store.getSnapshot()[0]?.requestHeaders?.['Authorization']).toBe('Bearer abc');
  });

  it('redacts top-level body keys', () => {
    const http = createHttpObserver({ redact: { bodyKeys: ['password'] } });
    http.onStart(
      start({
        method: 'POST',
        body: { email: 'a', password: 'secret' },
      })
    );

    const entry = http.store.getSnapshot()[0];
    expect(entry?.requestBody).toEqual({ email: 'a', password: '[REDACTED]' });
  });

  it('redacts response body keys on onEnd', () => {
    const http = createHttpObserver({ redact: { bodyKeys: ['token'] } });
    http.onStart(start());
    http.onEnd({
      id: 'r1',
      durationMs: 10,
      status: 200,
      responseBody: { user: 'u', token: 'jwt' },
    });
    const entry = http.store.getSnapshot()[0];
    expect(entry?.responseBody).toEqual({ user: 'u', token: '[REDACTED]' });
  });

  it('supports a custom replacement string', () => {
    const http = createHttpObserver({
      redact: { bodyKeys: ['secret'], replacement: '***' },
    });
    http.onStart(start({ method: 'POST', body: { secret: 'x' } }));
    expect(http.store.getSnapshot()[0]?.requestBody).toEqual({ secret: '***' });
  });

  it('leaves a plain non-PII string body unchanged', () => {
    const http = createHttpObserver({ redact: { bodyKeys: ['anything'] } });
    http.onStart(start({ method: 'POST', body: 'raw-string' }));
    expect(http.store.getSnapshot()[0]?.requestBody).toBe('raw-string');
  });

  it('scrubs PII from a raw (form-encoded) string body (API-1)', () => {
    const http = createHttpObserver();
    http.onStart(start({ method: 'POST', body: 'email=ada@example.com&password=secret' }));
    // Value patterns scrub the email even though the body is an opaque string.
    expect(http.store.getSnapshot()[0]?.requestBody).toBe('email=[REDACTED]&password=secret');
  });

  it('applies bodyKeys + value patterns to a JSON string body (API-1)', () => {
    const http = createHttpObserver({ redact: { bodyKeys: ['password'] } });
    http.onStart(
      start({ method: 'POST', body: JSON.stringify({ email: 'a@b.com', password: 'p' }) })
    );
    const stored = http.store.getSnapshot()[0]?.requestBody as string;
    expect(stored).toContain('[REDACTED]');
    expect(stored).not.toContain('a@b.com');
    expect(stored).not.toContain('"p"');
  });

  it('scrubs PII from a string response body on onEnd (API-1)', () => {
    const http = createHttpObserver();
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 10, status: 200, responseBody: 'user ada@example.com ok' });
    expect(http.store.getSnapshot()[0]?.responseBody).toBe('user [REDACTED] ok');
  });
});

describe('createHttpObserver — production gating', () => {
  it('is a no-op when __DEV__ is false and logInProduction is omitted', () => {
    globalScope.__DEV__ = false;
    const http = createHttpObserver();
    http.onStart(start());
    expect(http.store.getSnapshot()).toHaveLength(0);
  });

  it('captures in production when logInProduction: true', () => {
    globalScope.__DEV__ = false;
    const http = createHttpObserver({ logInProduction: true });
    http.onStart(start());
    expect(http.store.getSnapshot()).toHaveLength(1);
  });
});

describe('createHttpObserver — logger integration', () => {
  it('logs an error when onEnd carries an error', () => {
    const writes: Array<{ message: string }> = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [
        {
          name: 'capture',
          minLevel: LogLevel.DEBUG,
          write: e => writes.push({ message: e.message }),
        },
      ],
    });

    const http = createHttpObserver({ logger });
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 0, error: new Error('boom') });

    expect(writes).toHaveLength(1);
    expect(writes[0]?.message).toBe('HTTP error');
  });

  it('does NOT log when onEnd is a success', () => {
    const writes: unknown[] = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [{ name: 'capture', minLevel: LogLevel.DEBUG, write: e => writes.push(e) }],
    });

    const http = createHttpObserver({ logger });
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 10, status: 200 });

    expect(writes).toHaveLength(0);
  });

  it('does NOT log a cancelled request as an error (API-2)', () => {
    const writes: unknown[] = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [{ name: 'capture', minLevel: LogLevel.DEBUG, write: e => writes.push(e) }],
    });

    const http = createHttpObserver({ logger });
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 5, error: new Error('canceled'), cancelled: true });

    expect(writes).toHaveLength(0);
    expect(http.store.getSnapshot()[0]?.state).toBe('cancelled');
  });
});

describe('createHttpObserver — cancellation state (API-2)', () => {
  it('records a cancelled terminal state instead of error', () => {
    const http = createHttpObserver();
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 5, error: new Error('aborted'), cancelled: true });
    const e = http.store.getSnapshot()[0];
    expect(e?.state).toBe('cancelled');
    // The reason text is still kept for the detail view.
    expect(e?.error).toBe('aborted');
  });

  it('a normal error (cancelled omitted) is still state=error', () => {
    const http = createHttpObserver();
    http.onStart(start());
    http.onEnd({ id: 'r1', durationMs: 5, error: new Error('timeout') });
    expect(http.store.getSnapshot()[0]?.state).toBe('error');
  });
});

describe('createHttpObserver — screenProvider tagging (T5-1)', () => {
  it('tags the entry with the active screen from the provider', () => {
    const http = createHttpObserver({ screenProvider: () => 'Checkout' });
    http.onStart(start());
    expect(http.store.getSnapshot()[0]?.screen).toBe('Checkout');
  });

  it('omits screen when the provider returns undefined', () => {
    const http = createHttpObserver({ screenProvider: () => undefined });
    http.onStart(start());
    expect(http.store.getSnapshot()[0]?.screen).toBeUndefined();
  });

  it('omits screen when no provider is configured', () => {
    const http = createHttpObserver();
    http.onStart(start());
    expect(http.store.getSnapshot()[0]?.screen).toBeUndefined();
  });

  it('survives a provider that throws — screen is undefined, entry still recorded', () => {
    const http = createHttpObserver({
      screenProvider: () => {
        throw new Error('provider broken');
      },
    });
    expect(() => http.onStart(start())).not.toThrow();
    const entries = http.store.getSnapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.screen).toBeUndefined();
  });

  it('resolves the screen per request — a stateful provider tags each at start time', () => {
    let current = 'Home';
    const http = createHttpObserver({ screenProvider: () => current });
    http.onStart(start({ id: 'a' }));
    current = 'Profile';
    http.onStart(start({ id: 'b' }));

    const byId = new Map(http.store.getSnapshot().map(e => [e.id, e.screen]));
    expect(byId.get('a')).toBe('Home');
    expect(byId.get('b')).toBe('Profile');
  });
});

describe('createHttpObserver — explicit screen override (Option D)', () => {
  it('an explicit string `event.screen` overrides the ambient provider', () => {
    const http = createHttpObserver({ screenProvider: () => 'Home' });
    http.onStart(start({ id: 'a', screen: 'Checkout' }));
    expect(http.store.getSnapshot()[0]?.screen).toBe('Checkout');
  });

  it('`event.screen: null` forces "no screen" even with an active provider (global call)', () => {
    const http = createHttpObserver({ screenProvider: () => 'Home' });
    http.onStart(start({ id: 'a', screen: null }));
    expect(http.store.getSnapshot()[0]?.screen).toBeUndefined();
  });

  it('falls back to the provider when no override is given', () => {
    const http = createHttpObserver({ screenProvider: () => 'Home' });
    http.onStart(start({ id: 'a' }));
    expect(http.store.getSnapshot()[0]?.screen).toBe('Home');
  });
});

describe('createHttpObserver — breadcrumbs (T5-6)', () => {
  it('records a network breadcrumb on request completion', () => {
    const { BreadcrumbStore } =
      require('../../../src/integrations/breadcrumbs') as typeof import('../../../src/integrations/breadcrumbs');
    const breadcrumbs = new BreadcrumbStore();
    const http = createHttpObserver({ breadcrumbs });
    http.onStart(start({ id: 'r1', method: 'GET', url: 'https://api.example.com/users/1' }));
    http.onEnd({ id: 'r1', durationMs: 12, status: 200 });

    const [c] = breadcrumbs.getSnapshot();
    expect(c?.kind).toBe('network');
    expect(c?.level).toBe('info');
    expect(c?.message).toBe('GET https://api.example.com/users/1 → 200');
  });

  it('marks a failed request breadcrumb as error', () => {
    const { BreadcrumbStore } =
      require('../../../src/integrations/breadcrumbs') as typeof import('../../../src/integrations/breadcrumbs');
    const breadcrumbs = new BreadcrumbStore();
    const http = createHttpObserver({ breadcrumbs });
    http.onStart(start({ id: 'r1' }));
    http.onEnd({ id: 'r1', durationMs: 5, error: new Error('timeout') });

    const [c] = breadcrumbs.getSnapshot();
    expect(c?.level).toBe('error');
    expect(c?.message).toContain('→ error');
  });

  it('records nothing when no breadcrumb store is provided', () => {
    const http = createHttpObserver();
    http.onStart(start({ id: 'r1' }));
    http.onEnd({ id: 'r1', durationMs: 5, status: 200 });
    // No throw, no store — just the network log entry exists.
    expect(http.store.getSnapshot()).toHaveLength(1);
  });
});
