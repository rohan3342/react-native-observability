import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { AppErrorBoundary } from '../../src/error-boundary/AppErrorBoundary';
import { useErrorHandler } from '../../src/error-boundary/useErrorHandler';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

// Records the handler so tests can call it after mount
let capturedHandler: ((error: Error) => void) | null = null;

function TestComponent(): React.ReactElement {
  capturedHandler = useErrorHandler();
  return <></>;
}

describe('useErrorHandler', () => {
  beforeEach(() => {
    capturedHandler = null;
  });

  it('returns a function', () => {
    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(
        <AppErrorBoundary>
          <TestComponent />
        </AppErrorBoundary>
      );
    });
    expect(tree).toBeDefined();
    expect(typeof capturedHandler).toBe('function');
  });

  it('propagates the error to the nearest AppErrorBoundary', () => {
    const onError = jest.fn();
    act(() => {
      renderer.create(
        <AppErrorBoundary onError={onError}>
          <TestComponent />
        </AppErrorBoundary>
      );
    });

    const error = new Error('async-error');
    act(() => {
      capturedHandler!(error);
    });

    expect(onError).toHaveBeenCalledWith(error, expect.anything());
  });
});
