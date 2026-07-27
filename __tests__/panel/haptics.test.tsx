jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { HapticsProvider, useHaptics } from '../../src/panel/util/haptics';
import type { PanelHaptics } from '../../src/panel/util/haptics';

function mount(haptics: PanelHaptics | null, onApi: (api: ReturnType<typeof useHaptics>) => void) {
  function Probe() {
    onApi(useHaptics());
    return null;
  }
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(
      <HapticsProvider value={haptics}>
        <Probe />
      </HapticsProvider>
    );
  });
  return tree!;
}

describe('useHaptics', () => {
  it('forwards impact + notify to the injected adapter', () => {
    const impact = jest.fn();
    const notify = jest.fn();
    let api!: ReturnType<typeof useHaptics>;
    const tree = mount({ impact, notify }, a => (api = a));
    api.impact();
    api.notify('warning');
    expect(impact).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('warning');
    tree.unmount();
  });

  it('is a safe no-op when no adapter is injected', () => {
    let api!: ReturnType<typeof useHaptics>;
    const tree = mount(null, a => (api = a));
    expect(() => {
      api.impact();
      api.notify('success');
    }).not.toThrow();
    tree.unmount();
  });

  it('swallows errors thrown by a consumer adapter (never breaks an action)', () => {
    const throwing: PanelHaptics = {
      impact: () => {
        throw new Error('boom');
      },
      notify: () => {
        throw new Error('boom');
      },
    };
    let api!: ReturnType<typeof useHaptics>;
    const tree = mount(throwing, a => (api = a));
    expect(() => {
      api.impact();
      api.notify('error');
    }).not.toThrow();
    tree.unmount();
  });
});
