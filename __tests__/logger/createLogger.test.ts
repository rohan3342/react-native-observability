import {
  createLogger,
  getLogger,
  setDefaultLogger,
  _resetDefaultLogger,
} from '../../src/logger/createLogger';
import { LogLevel } from '../../src/logger/types';
import { MemoryTransport } from '../../src/logger/transports/MemoryTransport';

function makeTransport() {
  return new MemoryTransport({ maxEntries: 10 });
}

afterEach(() => {
  _resetDefaultLogger();
});

describe('createLogger()', () => {
  it('returns a Logger instance', () => {
    const t = makeTransport();
    const logger = createLogger({ namespace: 'test', level: LogLevel.DEBUG, transports: [t] });
    logger.info('hello');
    expect(t.getEntries()).toHaveLength(1);
  });

  it('creates independent instances — they do not share state', () => {
    const t1 = makeTransport();
    const t2 = makeTransport();
    const l1 = createLogger({ namespace: 'l1', level: LogLevel.DEBUG, transports: [t1] });
    createLogger({ namespace: 'l2', level: LogLevel.DEBUG, transports: [t2] });

    l1.info('only in l1');

    expect(t1.getEntries()).toHaveLength(1);
    expect(t2.getEntries()).toHaveLength(0);
  });
});

describe('setDefaultLogger() / getLogger()', () => {
  it('getLogger() throws before setDefaultLogger() is called', () => {
    expect(() => getLogger()).toThrow('[observability]');
  });

  it('getLogger() returns the instance set by setDefaultLogger()', () => {
    const t = makeTransport();
    const logger = createLogger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    setDefaultLogger(logger);

    const retrieved = getLogger();
    retrieved.info('via default');

    expect(t.getEntries()).toHaveLength(1);
    expect(t.getEntries()[0]!.namespace).toBe('app');
  });
});
