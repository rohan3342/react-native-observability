import { Logger } from '../../src/logger/Logger';
import { LogLevel } from '../../src/logger/types';
import { ConsoleTransport } from '../../src/logger/transports/ConsoleTransport';
import { installConsoleProxy } from '../../src/logger/installConsoleProxy';
import type { LogEntry, ITransport } from '../../src/logger/types';

/** A console stub capturing every call, injectable so we don't touch globals. */
function stubConsole() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const make =
    (method: string) =>
    (...args: unknown[]) =>
      calls.push({ method, args });
  return {
    calls,
    console: {
      log: make('log'),
      info: make('info'),
      warn: make('warn'),
      error: make('error'),
      debug: make('debug'),
    },
  };
}

/** A transport that records every entry it receives. */
function captureTransport(): ITransport & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return {
    name: 'capture',
    minLevel: LogLevel.DEBUG,
    write: e => entries.push(e),
    entries,
  };
}

describe('installConsoleProxy', () => {
  it('forwards console.* to the logger at the mapped level', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c } = stubConsole();

    const uninstall = installConsoleProxy(logger, { console: c });
    c.debug('d');
    c.log('l');
    c.info('i');
    c.warn('w');
    c.error('e');
    uninstall();

    expect(t.entries.map(e => e.level)).toEqual([
      LogLevel.DEBUG, // debug
      LogLevel.INFO, // log → info
      LogLevel.INFO, // info
      LogLevel.WARN, // warn
      LogLevel.ERROR, // error
    ]);
    expect(t.entries[0]?.message).toBe('d');
    expect(t.entries[0]?.context?.source).toBe('console');
  });

  it('attaches extra args as context.args', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c } = stubConsole();

    const uninstall = installConsoleProxy(logger, { console: c });
    c.info('hello', { a: 1 }, 'extra');
    uninstall();

    expect(t.entries[0]?.context?.args).toEqual([{ a: 1 }, 'extra']);
  });

  it('preserves an Error first-arg to console.error as the structured error', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c } = stubConsole();
    const boom = new Error('boom');

    const uninstall = installConsoleProxy(logger, { console: c });
    c.error(boom);
    uninstall();

    expect(t.entries[0]?.error).toBe(boom);
    expect(t.entries[0]?.message).toBe('boom');
  });

  it('does NOT recurse when the logger has a ConsoleTransport on the GLOBAL console', () => {
    // The real hazard: ConsoleTransport writes to the global console, which is
    // the very console we proxy. info → logger.info → ConsoleTransport.write →
    // console.log → (without the guard) back into the proxy → infinite loop.
    // We patch the real global console here, then restore it.
    const realLog = console.log;
    const realInfo = console.info;
    const realWarn = console.warn;
    const realError = console.error;
    const realDebug = console.debug;
    let globalCalls = 0;
    console.log = () => void globalCalls++;
    console.info = () => void globalCalls++;
    console.warn = () => void globalCalls++;
    console.error = () => void globalCalls++;
    console.debug = () => void globalCalls++;

    try {
      const logger = new Logger({
        namespace: 'app',
        level: LogLevel.DEBUG,
        transports: [new ConsoleTransport()], // writes to GLOBAL console
      });

      const uninstall = installConsoleProxy(logger); // proxies the GLOBAL console
      // Without the guard this overflows the stack; with it, it terminates and
      // the transport's output prints exactly once.
      expect(() => console.info('once')).not.toThrow();
      uninstall();

      // Bounded: the proxy forward (1 transport write) + the passthrough = a
      // handful of global calls, NOT an unbounded recursion.
      expect(globalCalls).toBeGreaterThan(0);
      expect(globalCalls).toBeLessThan(10);
    } finally {
      console.log = realLog;
      console.info = realInfo;
      console.warn = realWarn;
      console.error = realError;
      console.debug = realDebug;
    }
  });

  it('does NOT double-record a direct logger.* call when a ConsoleTransport + proxy coexist', () => {
    // Regression: logger.info() → ConsoleTransport.write() → console.log()
    // (patched by the proxy) → proxy re-forwards → logger.info() again → the
    // capture transport records the entry TWICE. The transport-writing guard
    // must make the proxy pass the transport's own output straight through.
    const globalScope = globalThis as unknown as { __DEV__?: boolean | undefined };
    const prevDev = globalScope.__DEV__;
    globalScope.__DEV__ = true; // enable ConsoleTransport

    const realLog = console.log;
    const realInfo = console.info;
    const realWarn = console.warn;
    const realError = console.error;
    const realDebug = console.debug;
    console.log = () => undefined;
    console.info = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    console.debug = () => undefined;

    try {
      const capture = captureTransport();
      const logger = new Logger({
        namespace: 'app',
        level: LogLevel.DEBUG,
        transports: [new ConsoleTransport(), capture], // ConsoleTransport writes to GLOBAL console
      });

      const uninstall = installConsoleProxy(logger); // proxies the GLOBAL console
      logger.info('hello'); // a DIRECT logger call, not console.*
      uninstall();

      // Exactly one entry — the transport's own console output is not re-forwarded.
      expect(capture.entries).toHaveLength(1);
      expect(capture.entries[0]?.message).toBe('hello');
    } finally {
      console.log = realLog;
      console.info = realInfo;
      console.warn = realWarn;
      console.error = realError;
      console.debug = realDebug;
      globalScope.__DEV__ = prevDev;
    }
  });

  it('still captures a genuine console.* call once when a ConsoleTransport is present', () => {
    const globalScope = globalThis as unknown as { __DEV__?: boolean | undefined };
    const prevDev = globalScope.__DEV__;
    globalScope.__DEV__ = true;

    const realLog = console.log;
    const realInfo = console.info;
    const realWarn = console.warn;
    const realError = console.error;
    const realDebug = console.debug;
    console.log = () => undefined;
    console.info = () => undefined;
    console.warn = () => undefined;
    console.error = () => undefined;
    console.debug = () => undefined;

    try {
      const capture = captureTransport();
      const logger = new Logger({
        namespace: 'app',
        level: LogLevel.DEBUG,
        transports: [new ConsoleTransport(), capture],
      });
      const uninstall = installConsoleProxy(logger);
      console.info('from console'); // genuine console call → should record once
      uninstall();

      expect(capture.entries).toHaveLength(1);
      expect(capture.entries[0]?.message).toBe('from console');
    } finally {
      console.log = realLog;
      console.info = realInfo;
      console.warn = realWarn;
      console.error = realError;
      console.debug = realDebug;
      globalScope.__DEV__ = prevDev;
    }
  });

  it('passthrough=true also calls the original console (default)', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c, calls } = stubConsole();

    const uninstall = installConsoleProxy(logger, { console: c });
    c.warn('keep me visible');
    uninstall();

    expect(calls.some(call => call.method === 'warn')).toBe(true);
  });

  it('passthrough=false routes exclusively through the logger', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c, calls } = stubConsole();

    const uninstall = installConsoleProxy(logger, { console: c, passthrough: false });
    c.info('quiet');
    uninstall();

    expect(t.entries).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it('uninstall restores the original methods and is idempotent', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c } = stubConsole();
    const originalInfo = c.info;

    const uninstall = installConsoleProxy(logger, { console: c });
    expect(c.info).not.toBe(originalInfo);
    uninstall();
    expect(c.info).toBe(originalInfo);
    expect(() => uninstall()).not.toThrow(); // idempotent
  });

  it('a throwing logger never breaks the console call', () => {
    const exploding: ITransport = {
      name: 'boom',
      minLevel: LogLevel.DEBUG,
      write: () => {
        throw new Error('transport down');
      },
    };
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [exploding] });
    const { console: c, calls } = stubConsole();

    const uninstall = installConsoleProxy(logger, { console: c });
    expect(() => c.info('still fine')).not.toThrow();
    uninstall();

    // Passthrough still fired despite the logger throwing.
    expect(calls.some(call => call.method === 'info')).toBe(true);
  });

  it('respects a custom namespace', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { console: c } = stubConsole();

    const uninstall = installConsoleProxy(logger, { console: c, namespace: 'legacy' });
    c.log('x');
    uninstall();

    expect(t.entries[0]?.context?.source).toBe('legacy');
  });
});
