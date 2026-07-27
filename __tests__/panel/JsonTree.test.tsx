jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { JsonTree } from '../../src/panel/components/JsonTree';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

function findAll(tree: renderer.ReactTestRenderer, type: string) {
  return tree.root.findAllByType(type as never);
}

function text(tree: renderer.ReactTestRenderer): string {
  const collect = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(collect).join('');
    if (c !== null && typeof c === 'object' && 'children' in c)
      return collect((c as { children: unknown }).children);
    return '';
  };
  return findAll(tree, 'Text')
    .map(n => collect(n.props.children))
    .join(' ');
}

function pressNode(tree: renderer.ReactTestRenderer, labelStartsWith: string): void {
  const node = findAll(tree, 'Pressable').find(p =>
    String(p.props.accessibilityLabel ?? '').startsWith(labelStartsWith)
  );
  act(() => {
    node?.props.onPress?.();
  });
}

describe('JsonTree', () => {
  it('renders top-level keys of the root object (root expanded)', () => {
    const tree = render(<JsonTree data={{ id: 42, name: 'Ada' }} />);
    const out = text(tree);
    expect(out).toMatch(/id/);
    expect(out).toMatch(/42/);
    expect(out).toMatch(/name/);
    expect(out).toMatch(/"Ada"/);
  });

  it('keeps nested objects collapsed until tapped', () => {
    const tree = render(<JsonTree data={{ outer: { secret: 'deep-value' } }} />);
    // Root is expanded so `outer` is visible, but its child is collapsed.
    expect(text(tree)).toMatch(/outer/);
    expect(text(tree)).not.toMatch(/deep-value/);
    pressNode(tree, 'outer,');
    expect(text(tree)).toMatch(/deep-value/);
  });

  it('shows array length summary and indices when expanded', () => {
    const tree = render(<JsonTree data={{ items: [10, 20] }} />);
    pressNode(tree, 'items,');
    const out = text(tree);
    expect(out).toMatch(/10/);
    expect(out).toMatch(/20/);
  });

  it('renders a circular reference safely', () => {
    const c: Record<string, unknown> = { a: 1 };
    c.self = c;
    const tree = render(<JsonTree data={c} />);
    pressNode(tree, 'self,');
    expect(text(tree)).toMatch(/<circular>/);
  });

  it('renders functions, null, and booleans as typed leaves', () => {
    const tree = render(<JsonTree data={{ fn: () => 1, n: null, b: true }} />);
    const out = text(tree);
    expect(out).toMatch(/<function>/);
    expect(out).toMatch(/null/);
    expect(out).toMatch(/true/);
  });
});
