import { Logger } from '../../src/logger/Logger';
import { IObservabilityAdapter, ITransport, LogEntry, LogLevel } from '../../src/logger/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Adapter fan-out is microtask-deferred (plan S7). Await this after a log call
 * before asserting on adapter side effects so the queued tasks have drained.
 */
function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

function makeTransport(minLevel = LogLevel.DEBUG): ITransport & { writes: LogEntry[] } {
  const writes: LogEntry[] = [];
  return {
    name: 'mock',
    minLevel,
    write: (entry: LogEntry) => writes.push(entry),
    writes,
  };
}

function makeAdapter(minLevel = LogLevel.ERROR): IObservabilityAdapter & {
  exceptions: Array<{ error: Error; ctx: Record<string, unknown> | undefined }>;
  messages: Array<{ message: string; level: LogLevel; ctx: Record<string, unknown> | undefined }>;
  users: Array<Record<string, unknown>>;
  contexts: Array<{ key: string; value: Record<string, unknown> }>;
} {
  const exceptions: Array<{ error: Error; ctx: Record<string, unknown> | undefined }> = [];
  const messages: Array<{
    message: string;
    level: LogLevel;
    ctx: Record<string, unknown> | undefined;
  }> = [];
  const users: Array<Record<string, unknown>> = [];
  const contexts: Array<{ key: string; value: Record<string, unknown> }> = [];
  return {
    name: 'mock-adapter',
    minLevel,
    captureException: (error, ctx) => exceptions.push({ error, ctx }),
    captureMessage: (message, level, ctx) => messages.push({ message, level, ctx }),
    setUser: user => users.push(user),
    setContext: (key, value) => contexts.push({ key, value }),
    exceptions,
    messages,
    users,
    contexts,
  };
}

// ─── Logger.write / level filtering ───────────────────────────────────────────

describe('Logger — transport fan-out', () => {
  it('writes to all transports when level meets their minLevel', () => {
    const t1 = makeTransport(LogLevel.WARN);
    const t2 = makeTransport(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t1, t2],
    });

    logger.debug('d');
    logger.warn('w');
    logger.error('e');

    // t1 (minLevel=WARN): warn + error
    expect(t1.writes).toHaveLength(2);
    expect(t1.writes[0]!.level).toBe(LogLevel.WARN);
    expect(t1.writes[1]!.level).toBe(LogLevel.ERROR);

    // t2 (minLevel=DEBUG): debug + warn + error
    expect(t2.writes).toHaveLength(3);
  });

  it('drops entries below the logger-level threshold before any transport sees them', () => {
    const t = makeTransport(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.WARN,
      transports: [t],
    });

    logger.debug('no');
    logger.info('no');
    logger.warn('yes');
    logger.error('yes');

    expect(t.writes).toHaveLength(2);
  });

  it('does not write anything when level is SILENT', () => {
    const t = makeTransport(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.SILENT,
      transports: [t],
    });

    logger.debug('no');
    logger.info('no');
    logger.warn('no');
    logger.error('no');

    expect(t.writes).toHaveLength(0);
  });

  it('populates all LogEntry fields correctly', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'ns', level: LogLevel.DEBUG, transports: [t] });
    const before = Date.now();
    logger.info('hello', { key: 'val' });
    const after = Date.now();

    const entry = t.writes[0]!;
    expect(entry.level).toBe(LogLevel.INFO);
    expect(entry.namespace).toBe('ns');
    expect(entry.message).toBe('hello');
    expect(entry.context).toEqual({ key: 'val' });
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
  });

  it('sets error field when logger.error receives an Error', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'ns', level: LogLevel.DEBUG, transports: [t] });
    const err = new Error('boom');
    logger.error('oops', err, { userId: 'u1' });

    const entry = t.writes[0]!;
    expect(entry.error).toBe(err);
    expect(entry.context).toEqual({ userId: 'u1' });
  });

  it('handles logger.error with only a context object (no Error)', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'ns', level: LogLevel.DEBUG, transports: [t] });
    logger.error('oops', { userId: 'u1' });

    const entry = t.writes[0]!;
    expect(entry.error).toBeUndefined();
    expect(entry.context).toEqual({ userId: 'u1' });
  });
});

// ─── Redaction ─────────────────────────────────────────────────────────────────

describe('Logger — redaction', () => {
  it('replaces redacted keys with [REDACTED] using string[] shorthand', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      redact: ['password', 'token'],
    });

    logger.info('login', { email: 'a@b.com', password: 'secret', token: 'abc123' });

    const ctx = t.writes[0]!.context!;
    // `email` is redacted by the default-on email value-pattern (D-1), even
    // though it is not in the `keys` list.
    expect(ctx['email']).toBe('[REDACTED]');
    expect(ctx['password']).toBe('[REDACTED]');
    expect(ctx['token']).toBe('[REDACTED]');
  });

  it('replaces with custom replacement string when provided', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      redact: { keys: ['ssn'], replacement: '***' },
    });

    logger.info('info', { ssn: '123-45-6789', name: 'Alice' });

    const ctx = t.writes[0]!.context!;
    expect(ctx['ssn']).toBe('***');
    expect(ctx['name']).toBe('Alice');
  });

  it('omits redacted keys entirely in omit mode', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      redact: { keys: ['cardNumber'], mode: 'omit' },
    });

    logger.info('pay', { amount: 100, cardNumber: '4111...' });

    const ctx = t.writes[0]!.context!;
    expect('cardNumber' in ctx).toBe(false);
    expect(ctx['amount']).toBe(100);
  });

  it('passes context through unmodified when no redact keys match', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      redact: ['secret'],
    });

    logger.info('msg', { safe: 'value' });
    expect(t.writes[0]!.context).toEqual({ safe: 'value' });
  });

  it('does not mutate the original context object', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      redact: ['password'],
    });

    const ctx = { email: 'a@b.com', password: 'secret' };
    logger.info('login', ctx);

    // Original should be unchanged
    expect(ctx.password).toBe('secret');
  });
});

// ─── message / error redaction (SEC-2) ────────────────────────────────────────

describe('Logger — message + error redaction (SEC-2)', () => {
  it('scrubs PII from the log message before transports see it', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'test', level: LogLevel.DEBUG, transports: [t] });

    logger.info('signing in ada@example.com now');
    expect(t.writes[0]!.message).toBe('signing in [REDACTED] now');
  });

  it('scrubs PII from error.message + stack without mutating the caller’s Error', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'test', level: LogLevel.DEBUG, transports: [t] });

    const err = new Error('auth failed for ada@example.com');
    logger.error('login failed', err);

    const stored = t.writes[0]!.error!;
    expect(stored.message).toBe('auth failed for [REDACTED]');
    expect(stored.stack).not.toContain('ada@example.com');
    // Caller's Error is untouched.
    expect(err.message).toBe('auth failed for ada@example.com');
    expect(stored).not.toBe(err);
    // The clone is still a real Error of the right type.
    expect(stored).toBeInstanceOf(Error);
  });

  it('returns the SAME Error reference when there is no PII to scrub (no needless clone)', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'test', level: LogLevel.DEBUG, transports: [t] });

    const err = new Error('plain failure');
    logger.error('oops', err);
    expect(t.writes[0]!.error).toBe(err);
  });

  it('forwards the redacted message + error to adapters (off-device path)', async () => {
    const adapter = makeAdapter(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [adapter],
    });

    logger.error('charge for ada@example.com', new Error('declined ada@example.com'));
    await flushMicrotasks();

    expect(adapter.exceptions).toHaveLength(1);
    expect(adapter.exceptions[0]!.error.message).toBe('declined [REDACTED]');

    logger.info('ping ada@example.com');
    await flushMicrotasks();
    expect(adapter.messages[adapter.messages.length - 1]!.message).toBe('ping [REDACTED]');
  });

  it('can be disabled by turning value patterns off', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      redact: { valuePatterns: { email: false, jwt: false, creditCard: false } },
    });

    logger.info('contact ada@example.com');
    expect(t.writes[0]!.message).toBe('contact ada@example.com');
  });
});

// ─── child() ──────────────────────────────────────────────────────────────────

describe('Logger — child()', () => {
  it('prefixes namespace correctly', () => {
    const t = makeTransport();
    const parent = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const child = parent.child('auth');
    const grandchild = child.child('otp');

    child.info('child message');
    grandchild.info('grandchild message');

    expect(t.writes[0]!.namespace).toBe('app:auth');
    expect(t.writes[1]!.namespace).toBe('app:auth:otp');
  });

  it('shares the same transport array reference', () => {
    const t = makeTransport();
    const parent = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const child = parent.child('auth');

    parent.info('from parent');
    child.info('from child');

    expect(t.writes).toHaveLength(2);
  });

  it('inherits the parent log level', () => {
    const t = makeTransport();
    const parent = new Logger({ namespace: 'app', level: LogLevel.WARN, transports: [t] });
    const child = parent.child('module');

    child.debug('no');
    child.info('no');
    child.warn('yes');

    expect(t.writes).toHaveLength(1);
    expect(t.writes[0]!.message).toBe('yes');
  });
});

// ─── Adapters ─────────────────────────────────────────────────────────────────

describe('Logger — adapter fan-out', () => {
  it('calls captureException when an Error is logged at or above adapter minLevel', async () => {
    const t = makeTransport();
    const adapter = makeAdapter(LogLevel.ERROR);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      adapters: [adapter],
    });

    const err = new Error('failure');
    logger.error('bad', err);
    await flushMicrotasks();

    expect(adapter.exceptions).toHaveLength(1);
    expect(adapter.exceptions[0]!.error).toBe(err);
  });

  it('does NOT call captureException for levels below adapter minLevel', () => {
    const t = makeTransport();
    const adapter = makeAdapter(LogLevel.ERROR);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      adapters: [adapter],
    });

    logger.warn('just a warning');
    expect(adapter.exceptions).toHaveLength(0);
    expect(adapter.messages).toHaveLength(0);
  });

  it('calls captureMessage for non-error entries at or above adapter minLevel', async () => {
    const t = makeTransport();
    const adapter = makeAdapter(LogLevel.WARN);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      adapters: [adapter],
    });

    logger.warn('watch out');
    logger.info('too low');
    await flushMicrotasks();

    expect(adapter.messages).toHaveLength(1);
    expect(adapter.messages[0]!.message).toBe('watch out');
    expect(adapter.messages[0]!.level).toBe(LogLevel.WARN);
  });

  it('forwards already-redacted context to the adapter', async () => {
    const t = makeTransport();
    const adapter = makeAdapter(LogLevel.ERROR);
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [t],
      adapters: [adapter],
      redact: ['token'],
    });

    logger.error('fail', new Error('x'), { token: 'secret', userId: 'u1' });
    await flushMicrotasks();

    const ctx = adapter.exceptions[0]!.ctx!;
    expect(ctx['token']).toBe('[REDACTED]');
    expect(ctx['userId']).toBe('u1');
  });
});

// ─── setUser / setContext ──────────────────────────────────────────────────────

describe('Logger — setUser / setContext', () => {
  it('propagates setUser to all adapters', () => {
    const a1 = makeAdapter();
    const a2 = makeAdapter();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [a1, a2],
    });

    logger.setUser({ id: 'u123', email: 'a@b.com' });

    expect(a1.users).toHaveLength(1);
    expect(a1.users[0]).toEqual({ id: 'u123', email: 'a@b.com' });
    expect(a2.users).toHaveLength(1);
  });

  it('propagates setContext to all adapters', () => {
    const a = makeAdapter();
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [a],
    });

    logger.setContext('app', { version: '1.0.0', env: 'staging' });

    expect(a.contexts).toHaveLength(1);
    expect(a.contexts[0]).toEqual({ key: 'app', value: { version: '1.0.0', env: 'staging' } });
  });

  it('isolates a throwing adapter in setUser — later adapters still run, no throw to caller (B1)', () => {
    const healthy = makeAdapter();
    const throwing = {
      ...makeAdapter(),
      name: 'throwing-adapter',
      setUser: () => {
        throw new Error('adapter setUser exploded');
      },
    };
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      // throwing adapter FIRST so we prove the loop continues past it
      adapters: [throwing, healthy],
    });

    expect(() => logger.setUser({ id: 'u1' })).not.toThrow();
    expect(healthy.users).toHaveLength(1);
  });

  it('isolates a throwing adapter in setContext — later adapters still run, no throw (B1)', () => {
    const healthy = makeAdapter();
    const throwing = {
      ...makeAdapter(),
      name: 'throwing-adapter',
      setContext: () => {
        throw new Error('adapter setContext exploded');
      },
    };
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [throwing, healthy],
    });

    expect(() => logger.setContext('k', { v: 1 })).not.toThrow();
    expect(healthy.contexts).toHaveLength(1);
  });
});

// ─── flush() ──────────────────────────────────────────────────────────────────

describe('Logger — flush()', () => {
  it('resolves after all adapter flush() calls complete', async () => {
    let flushed = false;
    const adapter: IObservabilityAdapter = {
      name: 'flushable',
      minLevel: LogLevel.ERROR,
      captureException: jest.fn(),
      flush: async () => {
        flushed = true;
      },
    };
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [adapter],
    });

    await logger.flush();
    expect(flushed).toBe(true);
  });

  it('resolves even if an adapter flush() rejects', async () => {
    const adapter: IObservabilityAdapter = {
      name: 'bad-flush',
      minLevel: LogLevel.ERROR,
      captureException: jest.fn(),
      flush: async () => {
        throw new Error('flush failed');
      },
    };
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [adapter],
    });

    await expect(logger.flush()).resolves.toBeUndefined();
  });
});

// ─── sessionIdProvider stamping ───────────────────────────────────────────────

describe('Logger — sessionIdProvider', () => {
  it('stamps entry.sessionId from the provider on every write', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      sessionIdProvider: () => 'session-abc',
    });

    logger.info('hello');
    logger.error('boom', new Error('x'));

    expect(t.writes).toHaveLength(2);
    expect(t.writes[0]?.sessionId).toBe('session-abc');
    expect(t.writes[1]?.sessionId).toBe('session-abc');
  });

  it('omits sessionId when the provider returns undefined', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      sessionIdProvider: () => undefined,
    });

    logger.info('hello');

    expect(t.writes[0]?.sessionId).toBeUndefined();
  });

  it('omits sessionId when no provider is configured', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
    });

    logger.info('hello');

    expect(t.writes[0]?.sessionId).toBeUndefined();
  });

  it('survives a provider that throws — sessionId is undefined, write still happens', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      sessionIdProvider: () => {
        throw new Error('provider broken');
      },
    });

    expect(() => logger.info('hello')).not.toThrow();
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0]?.sessionId).toBeUndefined();
  });

  it('child loggers inherit the parent sessionIdProvider', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      sessionIdProvider: () => 'session-xyz',
    });
    const child = logger.child('auth');

    child.info('hi');

    expect(t.writes[0]?.namespace).toBe('app:auth');
    expect(t.writes[0]?.sessionId).toBe('session-xyz');
  });
});

// ─── screenProvider stamping (T5-1) ───────────────────────────────────────────

describe('Logger — screenProvider', () => {
  it('stamps entry.screen from the provider on every write', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => 'Checkout',
    });

    logger.info('hello');
    logger.error('boom', new Error('x'));

    expect(t.writes).toHaveLength(2);
    expect(t.writes[0]?.screen).toBe('Checkout');
    expect(t.writes[1]?.screen).toBe('Checkout');
  });

  it('omits screen when the provider returns undefined', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => undefined,
    });

    logger.info('hello');

    expect(t.writes[0]?.screen).toBeUndefined();
  });

  it('omits screen when no provider is configured', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
    });

    logger.info('hello');

    expect(t.writes[0]?.screen).toBeUndefined();
  });

  it('survives a provider that throws — screen is undefined, write still happens', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => {
        throw new Error('provider broken');
      },
    });

    expect(() => logger.info('hello')).not.toThrow();
    expect(t.writes).toHaveLength(1);
    expect(t.writes[0]?.screen).toBeUndefined();
  });

  it('reflects the live screen — a stateful provider stamps the value at write time', () => {
    const t = makeTransport();
    let current: string | undefined = 'Home';
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => current,
    });

    logger.info('on home');
    current = 'Profile';
    logger.info('on profile');

    expect(t.writes[0]?.screen).toBe('Home');
    expect(t.writes[1]?.screen).toBe('Profile');
  });

  it('child loggers inherit the parent screenProvider', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => 'Dashboard',
    });
    const child = logger.child('auth');

    child.info('hi');

    expect(t.writes[0]?.screen).toBe('Dashboard');
  });
});

// ─── screen override via context (Option D) ───────────────────────────────────

describe('Logger — explicit screen override', () => {
  it('a string `screen` in context overrides the ambient provider', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => 'Home',
    });

    logger.info('reassigned', { screen: 'Profile', userId: 1 });

    expect(t.writes[0]?.screen).toBe('Profile');
  });

  it('`screen: null` forces "no screen" even with an active provider', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => 'Home',
    });

    logger.info('global work', { screen: null });

    expect(t.writes[0]?.screen).toBeUndefined();
  });

  it('strips the reserved `screen` key from the persisted context', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
    });

    logger.info('with extra', { screen: 'Cart', items: 3 });

    expect(t.writes[0]?.screen).toBe('Cart');
    expect(t.writes[0]?.context).toEqual({ items: 3 });
  });

  it('drops context entirely when `screen` was its only key', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
    });

    logger.info('only override', { screen: null });

    expect(t.writes[0]?.context).toBeUndefined();
  });

  it('falls back to the ambient provider when context has no `screen` key', () => {
    const t = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      screenProvider: () => 'Home',
    });

    logger.info('ambient', { userId: 1 });

    expect(t.writes[0]?.screen).toBe('Home');
  });
});

// ─── try/catch perimeter (transport isolation) ────────────────────────────────

describe('Logger — transport isolation', () => {
  const originalDev = (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__;

  beforeEach(() => {
    // Suppress dev-mode warnings during isolation tests
    (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__ = false;
  });
  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__ = originalDev;
  });

  it('does not throw to the caller when a transport throws', () => {
    const throwing: ITransport = {
      name: 'throwing',
      minLevel: LogLevel.DEBUG,
      write: () => {
        throw new Error('transport broken');
      },
    };
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [throwing],
    });

    expect(() => logger.info('hello')).not.toThrow();
  });

  it('still calls subsequent transports when an earlier transport throws', () => {
    const throwing: ITransport = {
      name: 'throwing',
      minLevel: LogLevel.DEBUG,
      write: () => {
        throw new Error('boom');
      },
    };
    const good = makeTransport();
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [throwing, good],
    });

    logger.info('hello');

    expect(good.writes).toHaveLength(1);
    expect(good.writes[0]?.message).toBe('hello');
  });
});

// ─── try/catch perimeter (adapter isolation) ──────────────────────────────────

describe('Logger — adapter isolation', () => {
  const originalDev = (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__;

  beforeEach(() => {
    (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__ = false;
  });
  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__ = originalDev;
  });

  it('does not throw to the caller when an adapter throws on captureException', () => {
    const throwing: IObservabilityAdapter = {
      name: 'broken',
      minLevel: LogLevel.ERROR,
      captureException: () => {
        throw new Error('adapter broken');
      },
    };
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [throwing],
    });

    expect(() => logger.error('boom', new Error('x'))).not.toThrow();
  });

  it('still calls subsequent adapters when an earlier adapter throws', async () => {
    const throwing: IObservabilityAdapter = {
      name: 'broken',
      minLevel: LogLevel.ERROR,
      captureException: () => {
        throw new Error('boom');
      },
    };
    const good = makeAdapter(LogLevel.ERROR);
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [throwing, good],
    });

    logger.error('boom', new Error('x'));
    await flushMicrotasks();

    expect(good.exceptions).toHaveLength(1);
  });

  it('still writes to transports when every adapter throws', () => {
    const t = makeTransport();
    const throwing: IObservabilityAdapter = {
      name: 'broken',
      minLevel: LogLevel.ERROR,
      captureException: () => {
        throw new Error('boom');
      },
    };
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [t],
      adapters: [throwing],
    });

    logger.error('boom', new Error('x'));

    expect(t.writes).toHaveLength(1);
  });

  it('does not throw when captureMessage throws on a non-error log', () => {
    const throwing: IObservabilityAdapter = {
      name: 'broken',
      minLevel: LogLevel.DEBUG,
      captureException: () => {},
      captureMessage: () => {
        throw new Error('boom');
      },
    };
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [throwing],
    });

    expect(() => logger.info('hi')).not.toThrow();
  });
});
