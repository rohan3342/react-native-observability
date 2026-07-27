jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Skeleton, SkeletonLines } from '../../src/panel/components/Skeleton';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

/** All host `View`s (the mock renders Animated.View as a plain `View`). */
function views(tree: renderer.ReactTestRenderer): renderer.ReactTestInstance[] {
  return tree.root.findAllByType('View' as never);
}

function mergedStyle(node: renderer.ReactTestInstance): Record<string, unknown> {
  const flat = ([] as unknown[]).concat(node.props.style).filter(Boolean);
  return Object.assign({}, ...(flat as object[]));
}

describe('Skeleton', () => {
  it('renders a placeholder block', () => {
    const tree = render(<Skeleton width={120} height={16} />);
    expect(views(tree).length).toBeGreaterThan(0);
  });

  it('is hidden from the accessibility tree (decorative)', () => {
    const tree = render(<Skeleton />);
    const hidden = views(tree).filter(v => v.props.accessibilityElementsHidden === true);
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden[0]!.props.importantForAccessibility).toBe('no');
  });

  it('applies the requested width and height', () => {
    const tree = render(<Skeleton width={80} height={10} />);
    const block = views(tree).find(v => mergedStyle(v).width === 80)!;
    expect(block).toBeDefined();
    expect(mergedStyle(block).height).toBe(10);
  });

  it('SkeletonLines renders the requested number of line blocks', () => {
    const tree = render(<SkeletonLines count={3} />);
    // Each line has an explicit numeric height; count those blocks.
    const lines = views(tree).filter(v => typeof mergedStyle(v).height === 'number');
    expect(lines.length).toBe(3);
  });
});
