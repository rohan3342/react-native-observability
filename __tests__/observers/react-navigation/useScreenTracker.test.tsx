import React from 'react';
import { act, create } from 'react-test-renderer';
import {
  useScreenTracker,
  _resetNavCache,
} from '../../../src/observers/react-navigation/useScreenTracker';
import { getScreenStore, _resetScreenStore } from '../../../src/integrations/screen/trackScreen';

// Controls what the lazy-required '@react-navigation/native' resolves to.
let mockRouteName = 'Home';
let lastEffect: (() => void | (() => void)) | undefined;

jest.mock(
  '@react-navigation/native',
  () => ({
    useRoute: () => ({ name: mockRouteName, params: undefined }),
    // Mimic useFocusEffect: run the effect, keep its cleanup, re-run when the
    // (memoized) callback identity changes — exactly what the real hook does.
    useFocusEffect: (effect: () => void | (() => void)) => {
      const React = require('react') as typeof import('react');
      const cleanupRef = React.useRef<void | (() => void)>(undefined);
      React.useEffect(() => {
        lastEffect = effect;
        cleanupRef.current = effect();
        return () => {
          if (typeof cleanupRef.current === 'function') cleanupRef.current();
        };
      }, [effect]);
    },
  }),
  { virtual: true }
);

function Screen() {
  useScreenTracker();
  return null;
}

afterEach(() => {
  _resetScreenStore();
  _resetNavCache();
  lastEffect = undefined;
  mockRouteName = 'Home';
  jest.restoreAllMocks();
});

describe('useScreenTracker (NAV-2)', () => {
  it('records a mount when the screen gains focus', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<Screen />);
    });
    const summaries = getScreenStore().getSummaries();
    expect(summaries.find(s => s.screen === 'Home')?.mountCount).toBe(1);
    act(() => tree!.unmount());
  });

  it('records an unmount when the screen loses focus (unmounts)', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<Screen />);
    });
    act(() => tree!.unmount());
    // After unmount the screen is no longer the live/mounted one.
    expect(getScreenStore().getMountedScreen()).toBeUndefined();
  });

  it('memoizes the focus effect across re-renders (NAV-1 — no churn)', () => {
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<Screen />);
    });
    const first = lastEffect;
    // Force a re-render with the same route — effect identity must be stable.
    act(() => tree!.update(<Screen />));
    expect(lastEffect).toBe(first);
    act(() => tree!.unmount());
  });

  it('is a silent no-op when @react-navigation/native is absent', () => {
    _resetNavCache();
    jest.resetModules();
    jest.doMock(
      '@react-navigation/native',
      () => {
        throw new Error('not installed');
      },
      { virtual: true }
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const globalScope = globalThis as unknown as { __DEV__: boolean | undefined };
    const prevDev = globalScope.__DEV__;
    globalScope.__DEV__ = true;

    const { useScreenTracker: freshHook } =
      require('../../../src/observers/react-navigation/useScreenTracker') as typeof import('../../../src/observers/react-navigation/useScreenTracker');

    function Bare() {
      freshHook();
      return null;
    }
    let tree: ReturnType<typeof create> | undefined;
    expect(() =>
      act(() => {
        tree = create(<Bare />);
      })
    ).not.toThrow();

    expect(warn).toHaveBeenCalledTimes(1); // exactly one dev warning
    act(() => tree!.unmount());
    globalScope.__DEV__ = prevDev;
  });
});
