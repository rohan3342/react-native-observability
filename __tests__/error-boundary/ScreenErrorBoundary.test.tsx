import React from 'react';
import renderer from 'react-test-renderer';
import {
  ScreenErrorBoundary,
  _resetFocusEffectCache,
} from '../../src/error-boundary/ScreenErrorBoundary';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
  _resetFocusEffectCache();
});

function Bomb({ shouldThrow }: { shouldThrow: boolean }): React.ReactElement {
  if (shouldThrow) throw new Error('test-error');
  return <></>;
}

function Fallback({ error }: { error: Error }): React.ReactElement {
  return <>{error.message}</>;
}

describe('ScreenErrorBoundary — basic boundary behaviour', () => {
  it('renders children when no error is thrown', () => {
    const tree = renderer.create(
      <ScreenErrorBoundary FallbackComponent={Fallback}>
        <Bomb shouldThrow={false} />
      </ScreenErrorBoundary>
    );
    expect(tree.toJSON()).toBe(null);
  });

  it('renders the fallback when a child throws', () => {
    const tree = renderer.create(
      <ScreenErrorBoundary FallbackComponent={Fallback}>
        <Bomb shouldThrow={true} />
      </ScreenErrorBoundary>
    );
    expect(tree.toJSON()).toBe('test-error');
  });
});

describe('ScreenErrorBoundary — resetOnBlur without @react-navigation/native', () => {
  // The peer is not installed in our test env; the prop must silently no-op.

  it('does not crash when resetOnBlur is true and the peer is absent', () => {
    expect(() =>
      renderer.create(
        <ScreenErrorBoundary resetOnBlur FallbackComponent={Fallback}>
          <Bomb shouldThrow={false} />
        </ScreenErrorBoundary>
      )
    ).not.toThrow();
  });

  it('still catches errors when resetOnBlur is true and the peer is absent', () => {
    const tree = renderer.create(
      <ScreenErrorBoundary resetOnBlur FallbackComponent={Fallback}>
        <Bomb shouldThrow={true} />
      </ScreenErrorBoundary>
    );
    expect(tree.toJSON()).toBe('test-error');
  });

  it('does not call require() until resetOnBlur is requested', () => {
    // When resetOnBlur is omitted, the lazy accessor should never run.
    // We can't introspect require() directly, but we can check that the warn
    // (which fires in dev when the peer is missing) is not emitted.
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (globalThis as unknown as { __DEV__: boolean | undefined }).__DEV__ = true;

    renderer.create(
      <ScreenErrorBoundary FallbackComponent={Fallback}>
        <Bomb shouldThrow={false} />
      </ScreenErrorBoundary>
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

// Note: a test asserting that `useFocusEffect` is invoked when the peer IS
// installed would require mocking @react-navigation/native and re-importing
// the module. Re-importing inside a test re-evaluates React too, which breaks
// hooks (multiple-React-copies issue). Covered instead by the navigation
// observer's own integration tests (Phase 5 rework) and by the ScreenErrorBoundary
// snapshot tests once the panel/observer layer lands.
