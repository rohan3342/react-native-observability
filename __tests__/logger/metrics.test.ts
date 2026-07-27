import { Logger } from '../../src/logger/Logger';
import { LogLevel } from '../../src/logger/types';
import type { IObservabilityAdapter, ITransport, LogEntry } from '../../src/logger/types';
import {
  getInternalMetrics,
  setKillSwitch,
  clearKillSwitch,
  clearPanic,
  configurePanic,
  recordStorageFailure,
  _resetMetrics,
} from '../../src/logger/internal/metrics';

function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

function makeAdapter(minLevel = LogLevel.DEBUG): IObservabilityAdapter & { calls: number } {
  const a = {
    name: 'mock',
    minLevel,
    calls: 0,
    captureException: () => {
      a.calls++;
    },
    captureMessage: () => {
      a.calls++;
    },
  };
  return a;
}

function makeTransport(): ITransport & { writes: LogEntry[] } {
  const writes: LogEntry[] = [];
  return { name: 't', minLevel: LogLevel.DEBUG, write: e => writes.push(e), writes };
}

beforeEach(() => {
  _resetMetrics();
});
afterEach(() => {
  _resetMetrics();
});

describe('kill switch', () => {
  it('short-circuits write and increments dropped.killSwitch; transports see nothing', () => {
    const t = makeTransport();
    const logger = new Logger({ namespace: 'a', level: LogLevel.DEBUG, transports: [t] });

    setKillSwitch('test');
    logger.info('hidden');
    logger.error('also hidden', new Error('x'));

    expect(t.writes).toHaveLength(0);
    expect(getInternalMetrics().dropped.killSwitch).toBe(2);

    clearKillSwitch();
    logger.info('visible');
    expect(t.writes).toHaveLength(1);
  });
});

describe('internal metrics — adapter fan-out', () => {
  it('counts adapter calls after the microtask drains', async () => {
    const a = makeAdapter(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'a',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [a],
    });

    logger.info('one');
    logger.info('two');
    expect(a.calls).toBe(0); // deferred — not yet
    await flushMicrotasks();
    expect(a.calls).toBe(2);
    expect(getInternalMetrics().adapter.calls).toBe(2);
  });
});

describe('sampling', () => {
  it('drops entries below the keep rate and counts dropped.sampled', async () => {
    const a = makeAdapter(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'a',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [a],
      sampling: { rates: { [LogLevel.INFO]: 0 } }, // drop all INFO to adapters
    });

    logger.info('dropped from adapters');
    await flushMicrotasks();

    expect(a.calls).toBe(0);
    expect(getInternalMetrics().dropped.sampled).toBe(1);
  });
});

describe('rate limiting', () => {
  it('drops overage entries at the adapter boundary and counts dropped.rateLimited', async () => {
    const a = makeAdapter(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'a',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [a],
      rateLimit: { perSecond: 0, burst: 1 }, // 1 allowed, no refill
    });

    logger.info('first allowed');
    logger.info('second over limit');
    logger.info('third over limit');
    await flushMicrotasks();

    expect(a.calls).toBe(1);
    expect(getInternalMetrics().dropped.rateLimited).toBe(2);
  });
});

describe('getInternalMetrics', () => {
  it('returns an immutable snapshot (mutating it does not affect internal state)', () => {
    const snap = getInternalMetrics();
    (snap.dropped as { sampled: number }).sampled = 999;
    expect(getInternalMetrics().dropped.sampled).toBe(0);
  });
});

describe('panic mode', () => {
  it('trips on a sustained run of queue-full drops and pauses the adapter fan-out', async () => {
    // Tiny queue + low trip threshold so the test is deterministic.
    configurePanic({ queueFullTrip: 3 });
    const a = makeAdapter(LogLevel.DEBUG);
    // An adapter that never lets the microtask drain by... actually we just
    // overflow the queue directly: with capacity 256, flood far past it before
    // the microtask runs (synchronously, in one tick).
    const logger = new Logger({
      namespace: 'p',
      level: LogLevel.DEBUG,
      transports: [makeTransport()],
      adapters: [a],
    });

    // Synchronously enqueue more than capacity(256) so queue-full fires ≥3×.
    for (let i = 0; i < 300; i++) logger.info(`flood ${i}`);
    expect(getInternalMetrics().panic.tripped).toBe(true);
    expect(getInternalMetrics().panic.reason).toBe('adapter queue saturated');

    // Fan-out is paused — draining does not deliver to the adapter.
    await flushMicrotasks();
    expect(a.calls).toBe(0);
  });

  it('trips after a run of storage failures via recordStorageFailure', () => {
    configurePanic({ storageFailTrip: 5 });
    for (let i = 0; i < 5; i++) recordStorageFailure();
    expect(getInternalMetrics().panic.tripped).toBe(true);
    expect(getInternalMetrics().panic.reason).toBe('storage persistently failing');
  });

  it('clearPanic() resumes the fan-out and a subsequent write drains', async () => {
    configurePanic({ storageFailTrip: 1 });
    recordStorageFailure(); // trips
    expect(getInternalMetrics().panic.tripped).toBe(true);

    clearPanic();
    expect(getInternalMetrics().panic.tripped).toBe(false);
    expect(getInternalMetrics().panic.reason).toBeUndefined();

    const a = makeAdapter(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'p',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [a],
    });
    logger.info('after recovery');
    await flushMicrotasks();
    expect(a.calls).toBe(1);
  });

  it('does not auto-recover — stays tripped across writes until cleared', async () => {
    configurePanic({ storageFailTrip: 1 });
    recordStorageFailure();
    const a = makeAdapter(LogLevel.DEBUG);
    const logger = new Logger({
      namespace: 'p',
      level: LogLevel.DEBUG,
      transports: [],
      adapters: [a],
    });
    logger.info('still panicking');
    await flushMicrotasks();
    expect(getInternalMetrics().panic.tripped).toBe(true);
    expect(a.calls).toBe(0);
  });

  it('configurePanic({trip: 0}) disables a trigger', () => {
    configurePanic({ storageFailTrip: 0 });
    for (let i = 0; i < 100; i++) recordStorageFailure();
    expect(getInternalMetrics().panic.tripped).toBe(false);
  });
});
