jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { Icon, IconSetProvider } from '../../src/panel/icons';
import type { IconSet } from '../../src/panel/icons';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

function firstText(tree: renderer.ReactTestRenderer): renderer.ReactTestInstance {
  return tree.root.findAllByType('Text' as never)[0]!;
}

describe('Icon', () => {
  it('renders the mapped glyph for a name', () => {
    const tree = render(<Icon name="close" accessibilityLabel="Close" />);
    expect(firstText(tree).props.children).toBe('✕');
  });

  it('maps distinct names to distinct glyphs', () => {
    const down = render(<Icon name="chevron-down" decorative />);
    const right = render(<Icon name="chevron-right" decorative />);
    expect(firstText(down).props.children).toBe('▾');
    expect(firstText(right).props.children).toBe('▸');
    expect(firstText(down).props.children).not.toBe(firstText(right).props.children);
  });

  it('resolves a token size key to the theme icon size', () => {
    const tree = render(<Icon name="refresh" size="lg" decorative />);
    // lightTokens.iconSizes.lg === 24
    expect(firstText(tree).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 24 })])
    );
  });

  it('accepts an explicit numeric size', () => {
    const tree = render(<Icon name="search" size={11} decorative />);
    expect(firstText(tree).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontSize: 11 })])
    );
  });

  it('announces a meaningful icon with its label and image role', () => {
    const tree = render(<Icon name="warning" accessibilityLabel="Warning" />);
    const node = firstText(tree);
    expect(node.props.accessibilityRole).toBe('image');
    expect(node.props.accessibilityLabel).toBe('Warning');
  });

  it('hides a decorative icon from the accessibility tree', () => {
    const tree = render(<Icon name="copy" decorative />);
    const node = firstText(tree);
    expect(node.props.accessibilityElementsHidden).toBe(true);
    expect(node.props.importantForAccessibility).toBe('no');
    expect(node.props.accessibilityRole).toBeUndefined();
  });

  it('does not scale with Dynamic Type (icons are fixed-size)', () => {
    const tree = render(<Icon name="close" decorative />);
    expect(firstText(tree).props.allowFontScaling).toBe(false);
  });
});

describe('Icon — injected iconSet', () => {
  function renderWithSet(set: IconSet, node: React.ReactElement): renderer.ReactTestRenderer {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <ThemeProvider>
          <IconSetProvider value={set}>{node}</IconSetProvider>
        </ThemeProvider>
      );
    });
    return tree!;
  }

  it('renders a custom renderer instead of the glyph, with resolved size + colour', () => {
    let seenSize = 0;
    let seenColor = '';
    const set: IconSet = {
      close: ({ size, color }) => {
        seenSize = size;
        seenColor = color;
        return <Text>CUSTOM</Text>;
      },
    };
    const tree = renderWithSet(set, <Icon name="close" size="lg" accessibilityLabel="Close" />);
    const texts = tree.root.findAllByType('Text' as never).map(n => n.props.children);
    expect(texts).toContain('CUSTOM');
    expect(texts).not.toContain('✕'); // the glyph was replaced
    expect(seenSize).toBe(24); // iconSizes.lg
    expect(seenColor).toBeTruthy(); // a resolved theme colour
  });

  it('falls back to the glyph when the set has no entry for the name', () => {
    const set: IconSet = { close: () => <Text>X</Text> };
    const tree = renderWithSet(set, <Icon name="search" decorative />);
    const texts = tree.root.findAllByType('Text' as never).map(n => n.props.children);
    expect(texts).toContain('⌕'); // search glyph, untouched
  });

  it('falls back to the glyph when a renderer returns null', () => {
    const set: IconSet = { close: () => null };
    const tree = renderWithSet(set, <Icon name="close" decorative />);
    const texts = tree.root.findAllByType('Text' as never).map(n => n.props.children);
    expect(texts).toContain('✕');
  });
});
