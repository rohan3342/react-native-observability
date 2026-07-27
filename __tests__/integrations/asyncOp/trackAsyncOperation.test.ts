import { trackAsyncOperation } from '../../../src/integrations/asyncOp/trackAsyncOperation';
import { Logger } from '../../../src/logger/Logger';
import { LogLevel } from '../../../src/logger/types';

describe('trackAsyncOperation', () => {
  it('logs an error via the supplied logger on onError', () => {
    const writes: Array<{ message: string; context: Record<string, unknown> | undefined }> = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [
        {
          name: 'capture',
          minLevel: LogLevel.DEBUG,
          write: e =>
            writes.push({
              message: e.message,
              context: e.context as Record<string, unknown> | undefined,
            }),
        },
      ],
    });

    const op = trackAsyncOperation({ key: 'fetchUser', namespace: 'auth', logger });
    op.onError(new Error('boom'));

    expect(writes).toHaveLength(1);
    expect(writes[0]?.message).toBe('Async operation failed');
    expect(writes[0]?.context?.['key']).toBe('fetchUser');
    expect(writes[0]?.context?.['namespace']).toBe('auth');
  });

  it('does not throw when no logger is provided', () => {
    const op = trackAsyncOperation({ key: 'noLog' });
    expect(() => op.onError(new Error('boom'))).not.toThrow();
  });

  it('onSuccess is a no-op (by current contract)', () => {
    const writes: unknown[] = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [{ name: 'capture', minLevel: LogLevel.DEBUG, write: e => writes.push(e) }],
    });

    const op = trackAsyncOperation({ key: 'fetchUser', logger });
    op.onSuccess();

    expect(writes).toHaveLength(0);
  });

  it('omits namespace from context when not provided', () => {
    const captured: Array<Record<string, unknown> | undefined> = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [
        {
          name: 'capture',
          minLevel: LogLevel.DEBUG,
          write: e => captured.push(e.context as Record<string, unknown> | undefined),
        },
      ],
    });

    const op = trackAsyncOperation({ key: 'k', logger });
    op.onError(new Error('e'));

    expect(captured[0]).toEqual({ key: 'k' });
  });
});
