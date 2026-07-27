import { Logger } from '../../src/logger/Logger';
import { LogLevel } from '../../src/logger/types';
import type { IObservabilityAdapter, ITransport, LogEntry } from '../../src/logger/types';
import { _resetMetrics } from '../../src/logger/internal/metrics';

/** Adapter fan-out is microtask-deferred — await this before asserting. */
function flushMicrotasks(): Promise<void> {
  return Promise.resolve().then(() => Promise.resolve());
}

function captureTransport(): ITransport & { writes: LogEntry[] } {
  const writes: LogEntry[] = [];
  return { name: 'capture', minLevel: LogLevel.DEBUG, write: e => writes.push(e), writes };
}

/**
 * Shared adapter contract (plan S13/S19). Every shipped adapter — and a
 * representative `createCustomAdapter` instance — MUST pass these assertions.
 * Call from inside a `describe(...)` block:
 *
 * ```ts
 * describe('SentryAdapter contract', () => {
 *   runAdapterContract('sentry', () => new SentryAdapter());
 * });
 * ```
 *
 * @param label - human name for the test output.
 * @param make - factory returning a FRESH adapter instance per test.
 */
export function runAdapterContract(label: string, make: () => IObservabilityAdapter): void {
  describe(`adapter contract: ${label}`, () => {
    beforeEach(() => _resetMetrics());
    afterEach(() => _resetMetrics());

    it('constructs and exposes the IObservabilityAdapter shape', () => {
      const a = make();
      expect(typeof a.name).toBe('string');
      expect(typeof a.minLevel).toBe('number');
      expect(typeof a.captureException).toBe('function');
    });

    it('does not throw when its SDK is unavailable (captureException is a safe no-op or succeeds)', () => {
      const a = make();
      expect(() => a.captureException(new Error('x'), { k: 'v' })).not.toThrow();
    });

    it('does not throw on the optional methods when present', () => {
      const a = make();
      expect(() => a.captureMessage?.('msg', LogLevel.ERROR, { k: 'v' })).not.toThrow();
      expect(() => a.setUser?.({ id: 'u1' })).not.toThrow();
      expect(() => a.setContext?.('key', { v: 1 })).not.toThrow();
    });

    it('respects minLevel when driven through the Logger (no calls below threshold)', async () => {
      const a = make();
      let calls = 0;
      const wrapped: IObservabilityAdapter = {
        ...a,
        name: a.name,
        minLevel: LogLevel.ERROR,
        captureException: (err, ctx) => {
          calls++;
          a.captureException(err, ctx);
        },
        captureMessage: (m, l, ctx) => {
          calls++;
          a.captureMessage?.(m, l, ctx);
        },
      };
      const logger = new Logger({
        namespace: 'contract',
        level: LogLevel.DEBUG,
        transports: [captureTransport()],
        adapters: [wrapped],
      });

      logger.info('below threshold'); // INFO < ERROR → must not reach adapter
      await flushMicrotasks();
      expect(calls).toBe(0);

      logger.error('at threshold', new Error('boom')); // ERROR ≥ ERROR → reaches adapter
      await flushMicrotasks();
      expect(calls).toBe(1);
    });

    it('is isolated by the Logger perimeter — a throwing adapter never breaks the pipeline', async () => {
      const a = make();
      const throwing: IObservabilityAdapter = {
        ...a,
        name: `${a.name}-throwing`,
        minLevel: LogLevel.ERROR,
        captureException: () => {
          throw new Error('adapter exploded');
        },
      };
      const transport = captureTransport();
      const logger = new Logger({
        namespace: 'contract',
        level: LogLevel.DEBUG,
        transports: [transport],
        adapters: [throwing],
      });

      expect(() => logger.error('boom', new Error('x'))).not.toThrow();
      await flushMicrotasks();
      // Transport still received the entry despite the adapter throwing.
      expect(transport.writes).toHaveLength(1);
    });

    it('flush() (when present) resolves and never rejects, and honours an aborted signal', async () => {
      const a = make();
      if (typeof a.flush !== 'function') return; // optional
      await expect(a.flush()).resolves.toBeUndefined();

      const controller = new AbortController();
      controller.abort();
      await expect(a.flush(controller.signal)).resolves.toBeUndefined();
    });
  });
}
