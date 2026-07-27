jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { AnimatedChevron } from '../../src/panel/components/AnimatedChevron';
import { PressableScale } from '../../src/panel/components/PressableScale';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

describe('AnimatedChevron', () => {
  it('renders a single caret glyph regardless of expanded state', () => {
    const collapsed = render(<AnimatedChevron expanded={false} />);
    const expanded = render(<AnimatedChevron expanded />);
    // It rotates rather than swapping glyphs — both states render the same mark.
    expect(collapsed.root.findAllByType('Text' as never)[0]!.props.children).toBe('▸');
    expect(expanded.root.findAllByType('Text' as never)[0]!.props.children).toBe('▸');
  });

  it('is decorative (hidden from the accessibility tree)', () => {
    const tree = render(<AnimatedChevron expanded={false} />);
    const node = tree.root.findAllByType('Text' as never)[0]!;
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no');
    expect(node.props.allowFontScaling).toBe(false);
  });
});

describe('PressableScale', () => {
  it('forwards press + accessibility props to the inner Pressable', () => {
    const onPress = jest.fn();
    const tree = render(
      <PressableScale accessibilityLabel="Edit" accessibilityRole="button" onPress={onPress}>
        <Text>CARD</Text>
      </PressableScale>
    );
    const pressable = tree.root.findByType('Pressable' as never);
    expect(pressable.props.accessibilityLabel).toBe('Edit');
    expect(pressable.props.accessibilityRole).toBe('button');
    act(() => pressable.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders its children', () => {
    const tree = render(
      <PressableScale accessibilityLabel="x">
        <Text>INNER</Text>
      </PressableScale>
    );
    expect(tree.root.findAllByType('Text' as never)[0]!.props.children).toBe('INNER');
  });

  it('drives a press-in / press-out without throwing', () => {
    const tree = render(
      <PressableScale accessibilityLabel="x">
        <Text>Y</Text>
      </PressableScale>
    );
    const pressable = tree.root.findByType('Pressable' as never);
    act(() => pressable.props.onPressIn());
    act(() => pressable.props.onPressOut());
  });
});
