jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  return {
    Pressable: function PressableStub(props: { onPress?: () => void }) {
      return React.createElement('Pressable', props);
    },
    StyleSheet: { create: <T extends Record<string, unknown>>(s: T) => s },
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MultiTapTarget } from '../../src/panel/gestures/MultiTapTarget';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

function getPressable(tree: renderer.ReactTestRenderer) {
  return tree.root.findByType('Pressable' as any);
}

describe('MultiTapTarget', () => {
  it('fires onTrigger after N rapid taps', () => {
    const onTrigger = jest.fn();
    const tree = render(<MultiTapTarget count={3} onTrigger={onTrigger} />);

    const press = getPressable(tree);
    act(() => {
      press.props.onPress();
      press.props.onPress();
      press.props.onPress();
    });

    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('resets the counter when taps slow down past maxDelayMs', () => {
    jest.useFakeTimers();
    const baseNow = Date.now();
    jest.setSystemTime(baseNow);

    const onTrigger = jest.fn();
    const tree = render(<MultiTapTarget count={3} maxDelayMs={200} onTrigger={onTrigger} />);
    const press = getPressable(tree);

    act(() => press.props.onPress()); // tap 1
    jest.setSystemTime(baseNow + 500); // gap > maxDelayMs
    act(() => press.props.onPress()); // resets to tap 1
    jest.setSystemTime(baseNow + 600);
    act(() => press.props.onPress()); // tap 2 — still below threshold

    expect(onTrigger).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not render when enabled is false', () => {
    const tree = render(<MultiTapTarget enabled={false} onTrigger={() => undefined} />);
    expect(tree.toJSON()).toBeNull();
  });

  it('sets accessible={false} to hide the target from screen readers', () => {
    const tree = render(<MultiTapTarget onTrigger={() => undefined} />);
    const press = getPressable(tree);
    expect(press.props.accessible).toBe(false);
    expect(press.props.accessibilityElementsHidden).toBe(true);
    expect(press.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('resets the counter after a successful trigger', () => {
    const onTrigger = jest.fn();
    const tree = render(<MultiTapTarget count={2} onTrigger={onTrigger} />);
    const press = getPressable(tree);

    act(() => {
      press.props.onPress();
      press.props.onPress(); // fires once
      press.props.onPress();
      press.props.onPress(); // fires twice — counter reset after first trigger
    });

    expect(onTrigger).toHaveBeenCalledTimes(2);
  });
});
