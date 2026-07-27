import { observeTRPC } from '../../src/observers/trpc/observeTRPC';
import { Logger } from '../../src/logger/Logger';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry, ITransport } from '../../src/logger/types';

function captureTransport(): ITransport & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { name: 'capture', minLevel: LogLevel.DEBUG, write: e => entries.push(e), entries };
}

/** A fake downstream link observable that emits next or error synchronously. */
function fakeObservable(outcome: { error?: unknown; value?: unknown }) {
  return {
    subscribe(observer: {
      next?: (v: unknown) => void;
      error?: (e: unknown) => void;
      complete?: () => void;
    }) {
      if (outcome.error !== undefined) observer.error?.(outcome.error);
      else {
        observer.next?.(outcome.value);
        observer.complete?.();
      }
      return { unsubscribe: () => {} };
    },
  };
}

describe('observeTRPC', () => {
  it('forwards a failed operation through the logger keyed by type:path', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const link = observeTRPC({ logger })();

    const op = { type: 'query' as const, path: 'user.byId' };
    const observable = link({ op, next: () => fakeObservable({ error: new Error('nope') }) });
    observable.subscribe({});

    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]?.level).toBe(LogLevel.ERROR);
    expect(t.entries[0]?.context?.key).toBe('trpc:query:user.byId');
  });

  it('does not log a successful operation', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const link = observeTRPC({ logger })();

    const op = { type: 'mutation' as const, path: 'user.create' };
    let received: unknown;
    link({ op, next: () => fakeObservable({ value: { id: 1 } }) }).subscribe({
      next: v => {
        received = v;
      },
    });

    expect(received).toEqual({ id: 1 });
    expect(t.entries).toHaveLength(0);
  });

  it('still forwards next/error to the downstream observer', () => {
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [] });
    const link = observeTRPC({ logger })();
    const op = { type: 'query' as const, path: 'x' };
    let erred: unknown;
    link({ op, next: () => fakeObservable({ error: new Error('boom') }) }).subscribe({
      error: e => {
        erred = e;
      },
    });
    expect((erred as Error).message).toBe('boom');
  });
});
