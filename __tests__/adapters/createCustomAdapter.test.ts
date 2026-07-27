import { LogLevel } from '../../src/logger/types';
import { createCustomAdapter } from '../../src/adapters/createCustomAdapter';

describe('createCustomAdapter', () => {
  it('returns an adapter with the provided name and captureException', () => {
    const captureException = jest.fn();
    const adapter = createCustomAdapter({ name: 'custom', captureException });

    expect(adapter.name).toBe('custom');
    adapter.captureException(new Error('x'));
    expect(captureException).toHaveBeenCalledWith(new Error('x'));
  });

  it('defaults minLevel to LogLevel.ERROR when not provided', () => {
    const adapter = createCustomAdapter({ name: 'custom', captureException: jest.fn() });
    expect(adapter.minLevel).toBe(LogLevel.ERROR);
  });

  it('respects a custom minLevel', () => {
    const adapter = createCustomAdapter({
      name: 'custom',
      captureException: jest.fn(),
      minLevel: LogLevel.WARN,
    });
    expect(adapter.minLevel).toBe(LogLevel.WARN);
  });

  it('passes optional methods through to the returned adapter', () => {
    const captureMessage = jest.fn();
    const setUser = jest.fn();
    const flush = jest.fn().mockResolvedValue(undefined);

    const adapter = createCustomAdapter({
      name: 'custom',
      captureException: jest.fn(),
      captureMessage,
      setUser,
      flush,
    });

    adapter.captureMessage?.('hello', LogLevel.WARN, {});
    expect(captureMessage).toHaveBeenCalledWith('hello', LogLevel.WARN, {});

    adapter.setUser?.({ id: 'u1' });
    expect(setUser).toHaveBeenCalledWith({ id: 'u1' });

    adapter.flush?.();
    expect(flush).toHaveBeenCalled();
  });
});
