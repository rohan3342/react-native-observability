import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppErrorBoundary } from '../../src/error-boundary/AppErrorBoundary';
import type { Logger } from '../../src/logger/Logger';

// Suppress React's error boundary console.error output in tests
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// A component that throws on first render when `shouldThrow` is true
function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new Error('test-error');
  return <></>;
}

describe('AppErrorBoundary — getDerivedStateFromError', () => {
  it('returns an error state from the thrown error', () => {
    const error = new Error('boom');
    const state = AppErrorBoundary.getDerivedStateFromError(error);
    expect(state).toEqual({ error });
  });
});

describe('AppErrorBoundary — componentDidCatch', () => {
  it('calls logger.error when a logger is provided', () => {
    const mockLogger = { error: jest.fn() } as unknown as Logger;
    const error = new Error('caught');
    const info: React.ErrorInfo = { componentStack: '\n  in Bomb', digest: null };

    const boundary = new AppErrorBoundary({ children: null, logger: mockLogger });
    boundary.componentDidCatch(error, info);

    expect(mockLogger.error).toHaveBeenCalledWith('AppErrorBoundary caught', error, {
      componentStack: '\n  in Bomb',
    });
  });

  it('calls onError when provided', () => {
    const onError = jest.fn();
    const error = new Error('caught');
    const info: React.ErrorInfo = { componentStack: null, digest: null };

    const boundary = new AppErrorBoundary({ children: null, onError });
    boundary.componentDidCatch(error, info);

    expect(onError).toHaveBeenCalledWith(error, info);
  });

  it('does not throw when neither logger nor onError is provided', () => {
    const boundary = new AppErrorBoundary({ children: null });
    expect(() =>
      boundary.componentDidCatch(new Error('x'), { componentStack: null, digest: null })
    ).not.toThrow();
  });

  it('isolates a throwing onError callback (EH-1)', () => {
    const onError = jest.fn(() => {
      throw new Error('buggy consumer handler');
    });
    const boundary = new AppErrorBoundary({ children: null, onError });
    // A throwing user callback must not escape componentDidCatch (which would
    // turn a recoverable render error into a fatal secondary crash).
    expect(() =>
      boundary.componentDidCatch(new Error('caught'), { componentStack: null, digest: null })
    ).not.toThrow();
    expect(onError).toHaveBeenCalled();
  });
});

describe('AppErrorBoundary — render', () => {
  it('renders children when there is no error', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(
        <AppErrorBoundary>
          <Bomb shouldThrow={false} />
        </AppErrorBoundary>
      );
    });
    expect(tree).toBeDefined();
  });

  it('renders null by default when an error is caught', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(
        <AppErrorBoundary>
          <Bomb shouldThrow={true} />
        </AppErrorBoundary>
      );
    });
    // Default fallback is null — nothing rendered
    expect(tree?.toJSON()).toBeNull();
  });

  it('renders FallbackComponent when an error is caught', () => {
    const Fallback = ({ error }: { error: Error; retry: () => void }) => <>{error.message}</>;

    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(
        <AppErrorBoundary FallbackComponent={Fallback}>
          <Bomb shouldThrow={true} />
        </AppErrorBoundary>
      );
    });
    expect(tree?.toJSON()).toEqual('test-error');
  });
});

describe('AppErrorBoundary — retry', () => {
  it('clears the error state and re-renders children', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    let boundaryRef: AppErrorBoundary | null = null;

    act(() => {
      tree = renderer.create(
        <AppErrorBoundary
          ref={r => {
            boundaryRef = r;
          }}
        >
          <Bomb shouldThrow={true} />
        </AppErrorBoundary>
      );
    });

    // Error state active — renders null
    expect(tree?.toJSON()).toBeNull();

    act(() => {
      boundaryRef?.retry();
    });

    // After retry, children render again (and throw again, cycling back to null)
    expect(tree?.toJSON()).toBeNull();
  });
});

describe('AppErrorBoundary — isolate prop', () => {
  it('does not call logger.error when isolate is true', () => {
    const mockLogger = { error: jest.fn() } as unknown as Logger;
    const error = new Error('sandboxed');
    const info: React.ErrorInfo = { componentStack: '\n  in Bomb', digest: null };

    const boundary = new AppErrorBoundary({ children: null, logger: mockLogger, isolate: true });
    boundary.componentDidCatch(error, info);

    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('does not call onError when isolate is true', () => {
    const onError = jest.fn();
    const error = new Error('sandboxed');
    const info: React.ErrorInfo = { componentStack: null, digest: null };

    const boundary = new AppErrorBoundary({ children: null, onError, isolate: true });
    boundary.componentDidCatch(error, info);

    expect(onError).not.toHaveBeenCalled();
  });

  it('still renders the fallback when isolate is true', () => {
    const Fallback = ({ error }: { error: Error; retry: () => void }) => <>{error.message}</>;

    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(
        <AppErrorBoundary isolate FallbackComponent={Fallback}>
          <Bomb shouldThrow={true} />
        </AppErrorBoundary>
      );
    });

    expect(tree?.toJSON()).toEqual('test-error');
  });

  it('calls logger and onError when isolate is false (default behaviour preserved)', () => {
    const mockLogger = { error: jest.fn() } as unknown as Logger;
    const onError = jest.fn();
    const error = new Error('forwarded');
    const info: React.ErrorInfo = { componentStack: null, digest: null };

    const boundary = new AppErrorBoundary({
      children: null,
      logger: mockLogger,
      onError,
      isolate: false,
    });
    boundary.componentDidCatch(error, info);

    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(error, info);
  });
});
