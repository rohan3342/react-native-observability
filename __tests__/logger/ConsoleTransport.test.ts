import { ConsoleTransport } from '../../src/logger/transports/ConsoleTransport';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry } from '../../src/logger/types';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: 'id',
    timestamp: 0,
    level: LogLevel.INFO,
    namespace: 'test',
    message: 'hello',
    ...overrides,
  };
}

describe('ConsoleTransport', () => {
  const globalScope = globalThis as unknown as { __DEV__: boolean | undefined };
  const originalDev = globalScope.__DEV__;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    globalScope.__DEV__ = originalDev;
  });

  // ─── ANSI escape guard ──────────────────────────────────────────────────────
  // Regression test for audit finding I1: ANSI escapes render as literal
  // "\x1b[33m..." garbage in LogBox and on Android. The transport must never
  // emit them.

  it('does not emit ANSI escape sequences in any argument', () => {
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();

    t.write(entry({ level: LogLevel.DEBUG }));
    t.write(entry({ level: LogLevel.INFO }));
    t.write(entry({ level: LogLevel.WARN }));
    t.write(entry({ level: LogLevel.ERROR, error: new Error('x') }));

    const allCalls = [...logSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls];
    expect(allCalls.length).toBeGreaterThan(0);
    for (const callArgs of allCalls) {
      for (const arg of callArgs) {
        if (typeof arg === 'string') {
          expect(arg).not.toMatch(/\x1b\[/);
        }
      }
    }
  });

  it('renders a plain-text [LEVEL] [namespace] prefix', () => {
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();

    t.write(entry({ level: LogLevel.WARN, namespace: 'auth' }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toBe('[WARN ] [auth]');
  });

  // ─── Routing by level ──────────────────────────────────────────────────────

  it('routes DEBUG and INFO to console.log', () => {
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();

    t.write(entry({ level: LogLevel.DEBUG }));
    t.write(entry({ level: LogLevel.INFO }));

    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('routes WARN to console.warn', () => {
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();

    t.write(entry({ level: LogLevel.WARN }));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('routes ERROR to console.error', () => {
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();

    t.write(entry({ level: LogLevel.ERROR }));

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // ─── Production gating ─────────────────────────────────────────────────────

  it('is silent when __DEV__ is false and logInProduction is omitted', () => {
    globalScope.__DEV__ = false;
    const t = new ConsoleTransport();

    t.write(entry({ level: LogLevel.ERROR }));

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('writes in production when logInProduction: true', () => {
    globalScope.__DEV__ = false;
    const t = new ConsoleTransport({ logInProduction: true });

    t.write(entry({ level: LogLevel.ERROR }));

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('caches the __DEV__ decision at construction (does not re-read per write)', () => {
    // Construct while dev is true
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();
    // Flip to false after construction — should still write because the decision is cached
    globalScope.__DEV__ = false;

    t.write(entry({ level: LogLevel.INFO }));

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  // ─── Argument forwarding ───────────────────────────────────────────────────

  it('forwards context and error when both are present', () => {
    globalScope.__DEV__ = true;
    const t = new ConsoleTransport();
    const ctx = { userId: 'u' };
    const err = new Error('boom');

    t.write(entry({ level: LogLevel.ERROR, context: ctx, error: err }));

    expect(errorSpy).toHaveBeenCalledWith('[ERROR] [test]', 'hello', ctx, err);
  });
});
