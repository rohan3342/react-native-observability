import { installGlobalErrorHandler } from '../../src/error-boundary/installGlobalErrorHandler';
import { Logger } from '../../src/logger/Logger';
import { LogLevel } from '../../src/logger/types';
import type { ITransport, LogEntry } from '../../src/logger/types';

function makeLogger(): { logger: Logger; writes: LogEntry[] } {
  const writes: LogEntry[] = [];
  const transport: ITransport = {
    name: 't',
    minLevel: LogLevel.DEBUG,
    write: e => writes.push(e),
  };
  const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [transport] });
  return { logger, writes };
}

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;

function makeErrorUtils(initial?: GlobalHandler) {
  let current = initial;
  return {
    getGlobalHandler: () => current,
    setGlobalHandler: (h: GlobalHandler) => {
      current = h;
    },
    /** Test helper: invoke whatever handler is currently installed. */
    fire: (error: unknown, isFatal?: boolean) => current?.(error, isFatal),
    get currentHandler() {
      return current;
    },
  };
}

describe('installGlobalErrorHandler — layer 1 (sync handler)', () => {
  it('forwards an uncaught error to logger.error', () => {
    const { logger, writes } = makeLogger();
    const eu = makeErrorUtils();

    installGlobalErrorHandler(logger, { _errorUtils: eu, trackRejections: false });
    const err = new Error('boom');
    eu.fire(err, true);

    expect(writes).toHaveLength(1);
    expect(writes[0]!.message).toBe('Uncaught JS error');
    expect(writes[0]!.error).toBe(err);
    expect(writes[0]!.context).toMatchObject({ isFatal: true, source: 'global' });
  });

  it('chains the previous handler by default', () => {
    const { logger } = makeLogger();
    const previous = jest.fn();
    const eu = makeErrorUtils(previous);

    installGlobalErrorHandler(logger, { _errorUtils: eu, trackRejections: false });
    eu.fire(new Error('x'), false);

    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing chained handler so it never re-enters the global hook (EH-2)', () => {
    const { logger } = makeLogger();
    const previous = jest.fn(() => {
      throw new Error('buggy previous handler');
    });
    const eu = makeErrorUtils(previous);

    installGlobalErrorHandler(logger, { _errorUtils: eu, trackRejections: false });
    // The chained foreign handler throws, but our handler must swallow it.
    expect(() => eu.fire(new Error('x'), false)).not.toThrow();
    expect(previous).toHaveBeenCalledTimes(1);
  });

  it('does NOT chain when chainPrevious is false', () => {
    const { logger } = makeLogger();
    const previous = jest.fn();
    const eu = makeErrorUtils(previous);

    installGlobalErrorHandler(logger, {
      _errorUtils: eu,
      chainPrevious: false,
      trackRejections: false,
    });
    eu.fire(new Error('x'));

    expect(previous).not.toHaveBeenCalled();
  });

  it('wraps a non-Error thrown value into an Error', () => {
    const { logger, writes } = makeLogger();
    const eu = makeErrorUtils();

    installGlobalErrorHandler(logger, { _errorUtils: eu, trackRejections: false });
    eu.fire('a string failure');

    expect(writes[0]!.error).toBeInstanceOf(Error);
    expect(writes[0]!.error!.message).toBe('a string failure');
  });

  it('teardown restores the previous handler', () => {
    const { logger } = makeLogger();
    const previous = jest.fn();
    const eu = makeErrorUtils(previous);

    const uninstall = installGlobalErrorHandler(logger, {
      _errorUtils: eu,
      trackRejections: false,
    });
    expect(eu.currentHandler).not.toBe(previous);

    uninstall();
    expect(eu.currentHandler).toBe(previous);
  });

  it('the installed handler never throws even if logging throws', () => {
    const throwingLogger = {
      error: () => {
        throw new Error('logger broken');
      },
    } as unknown as Logger;
    const eu = makeErrorUtils();

    installGlobalErrorHandler(throwingLogger, { _errorUtils: eu, trackRejections: false });
    expect(() => eu.fire(new Error('x'))).not.toThrow();
  });

  it('is a no-op (no throw) when ErrorUtils is absent', () => {
    const { logger } = makeLogger();
    expect(() =>
      installGlobalErrorHandler(logger, { _errorUtils: undefined, trackRejections: false })
    ).not.toThrow();
  });
});

describe('installGlobalErrorHandler — layer 2 (rejections)', () => {
  it('uses the Hermes tracker when available', () => {
    const { logger, writes } = makeLogger();
    let captured: ((id: number, error: unknown) => void) | undefined;
    const hermes = {
      enablePromiseRejectionTracker: (opts: {
        onUnhandled: (id: number, error: unknown) => void;
      }) => {
        captured = opts.onUnhandled;
      },
    };

    installGlobalErrorHandler(logger, { _errorUtils: undefined, _hermes: hermes });
    captured?.(7, new Error('rejected'));

    expect(writes).toHaveLength(1);
    expect(writes[0]!.message).toBe('Unhandled promise rejection');
    expect(writes[0]!.context).toMatchObject({ source: 'rejection' });
  });

  it('falls back to the unhandledrejection event when Hermes is absent', () => {
    const { logger, writes } = makeLogger();
    type EvListener = (event: unknown) => void;
    const listeners: Record<string, EvListener> = {};
    const eventTarget = {
      addEventListener: (type: string, l: EvListener) => {
        listeners[type] = l;
      },
      removeEventListener: jest.fn(),
    };

    const uninstall = installGlobalErrorHandler(logger, {
      _errorUtils: undefined,
      _hermes: undefined,
      _eventTarget: eventTarget,
    });

    listeners['unhandledrejection']?.({ reason: new Error('async boom') });
    expect(writes).toHaveLength(1);
    expect(writes[0]!.message).toBe('Unhandled promise rejection');

    uninstall();
    expect(eventTarget.removeEventListener).toHaveBeenCalledWith(
      'unhandledrejection',
      expect.any(Function)
    );
  });

  it('does not register rejection tracking when trackRejections is false', () => {
    const { logger } = makeLogger();
    const hermes = { enablePromiseRejectionTracker: jest.fn() };

    installGlobalErrorHandler(logger, {
      _errorUtils: undefined,
      _hermes: hermes,
      trackRejections: false,
    });

    expect(hermes.enablePromiseRejectionTracker).not.toHaveBeenCalled();
  });
});

describe('installGlobalErrorHandler — teardown', () => {
  it('teardown is idempotent', () => {
    const { logger } = makeLogger();
    const previous = jest.fn();
    const eu = makeErrorUtils(previous);
    const uninstall = installGlobalErrorHandler(logger, {
      _errorUtils: eu,
      trackRejections: false,
    });
    uninstall();
    expect(() => uninstall()).not.toThrow();
  });
});
