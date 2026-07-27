let backHandlers: Array<() => boolean> = [];

jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const passthrough = (name: string) =>
    function Stub(props: { children?: React.ReactNode }) {
      return React.createElement(name, props, props.children);
    };
  class FakeValue {
    constructor(public v: number) {}
    setValue(n: number) {
      this.v = n;
    }
    interpolate() {
      return this;
    }
  }
  return {
    View: passthrough('View'),
    Text: passthrough('Text'),
    Pressable: passthrough('Pressable'),
    Animated: {
      View: passthrough('Animated.View'),
      spring: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
      parallel: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
      Value: FakeValue,
      timing: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined }),
    },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(s: T) => s,
      absoluteFillObject: {},
      absoluteFill: {},
      hairlineWidth: 1,
    },
    BackHandler: {
      addEventListener: (_type: string, cb: () => boolean) => {
        backHandlers.push(cb);
        return {
          remove: () => {
            backHandlers = backHandlers.filter(h => h !== cb);
          },
        };
      },
    },
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Overlay } from '../../src/panel/components/Overlay';
import { ThemeProvider } from '../../src/panel/theme';

beforeEach(() => {
  backHandlers = [];
});

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

function pressables(tree: renderer.ReactTestRenderer) {
  return tree.root.findAllByType('Pressable' as never);
}

describe('Overlay', () => {
  it('renders nothing when not visible', () => {
    const tree = render(
      <Overlay visible={false} onRequestClose={() => {}}>
        <></>
      </Overlay>
    );
    expect(tree.root.findAllByType('View' as never)).toHaveLength(0);
    expect(backHandlers).toHaveLength(0);
  });

  it('renders content and a scrim when visible', () => {
    const tree = render(
      <Overlay visible onRequestClose={() => {}} closeAccessibilityLabel="Close it">
        <></>
      </Overlay>
    );
    const scrim = pressables(tree).find(
      p => String(p.props.accessibilityLabel ?? '') === 'Close it'
    );
    expect(scrim).toBeDefined();
  });

  it('omits the scrim Pressable when scrim={false}', () => {
    const tree = render(
      <Overlay visible scrim={false} onRequestClose={() => {}} closeAccessibilityLabel="Close it">
        <></>
      </Overlay>
    );
    const scrim = pressables(tree).find(
      p => String(p.props.accessibilityLabel ?? '') === 'Close it'
    );
    expect(scrim).toBeUndefined();
  });

  it('calls onRequestClose when the scrim is pressed', () => {
    const onClose = jest.fn();
    const tree = render(
      <Overlay visible onRequestClose={onClose} closeAccessibilityLabel="Close it">
        <></>
      </Overlay>
    );
    const scrim = pressables(tree).find(
      p => String(p.props.accessibilityLabel ?? '') === 'Close it'
    );
    act(() => scrim!.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('registers a hardware-back handler that closes and consumes the event', () => {
    const onClose = jest.fn();
    render(
      <Overlay visible onRequestClose={onClose}>
        <></>
      </Overlay>
    );
    expect(backHandlers).toHaveLength(1);
    const consumed = backHandlers[0]!();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(consumed).toBe(true); // prevents the nav stack from popping underneath
  });

  it('removes the back handler when it unmounts / hides', () => {
    const tree = render(
      <Overlay visible onRequestClose={() => {}}>
        <></>
      </Overlay>
    );
    expect(backHandlers).toHaveLength(1);
    act(() => tree.unmount());
    expect(backHandlers).toHaveLength(0);
  });

  /** Flatten an Animated.View's style array and collect transform keys. */
  function transformKeys(tree: renderer.ReactTestRenderer): string[] {
    const view = tree.root
      .findAllByType('Animated.View' as never)
      .find(
        v =>
          Array.isArray(v.props.style) &&
          v.props.style.some((s: unknown) => s && (s as { transform?: unknown }).transform)
      );
    const styles =
      (view?.props.style as Array<{ transform?: Array<Record<string, unknown>> }>) ?? [];
    const transform = styles.flatMap(s => s?.transform ?? []);
    return transform.flatMap(tr => Object.keys(tr));
  }

  it('bottom placement slides (translateY), not scale', () => {
    const tree = render(
      <Overlay visible placement="bottom" onRequestClose={() => {}}>
        <></>
      </Overlay>
    );
    const keys = transformKeys(tree);
    expect(keys).toContain('translateY');
    expect(keys).not.toContain('scale');
  });

  it('center placement scales (fade+scale)', () => {
    const tree = render(
      <Overlay visible placement="center" onRequestClose={() => {}}>
        <></>
      </Overlay>
    );
    expect(transformKeys(tree)).toContain('scale');
  });
});
