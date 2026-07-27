jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { JsonField } from '../../src/panel/components/JsonField';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

function allText(tree: renderer.ReactTestRenderer): string {
  const collect = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(collect).join('');
    if (c !== null && typeof c === 'object' && 'children' in c)
      return collect((c as { children: unknown }).children);
    return '';
  };
  return tree.root
    .findAllByType('Text' as never)
    .map((n: renderer.ReactTestInstance) => collect(n.props.children))
    .join(' ');
}

describe('JsonField', () => {
  it('shows "Valid JSON" note for parseable content', () => {
    const tree = render(<JsonField value='{"ok":true}' onChange={() => {}} />);
    expect(allText(tree)).toContain('Valid JSON');
  });

  it('shows raw-text note for invalid JSON', () => {
    const tree = render(<JsonField value="not json" onChange={() => {}} />);
    expect(allText(tree)).toContain('raw text');
  });

  it('shows no note when empty', () => {
    const tree = render(<JsonField value="" onChange={() => {}} />);
    const text = allText(tree);
    expect(text).not.toContain('Valid JSON');
    expect(text).not.toContain('raw text');
  });

  it('shows a "Format" button for valid JSON', () => {
    const tree = render(<JsonField value='{"a":1}' onChange={() => {}} />);
    const pressables = tree.root.findAllByType('Pressable' as never);
    const formatBtn = pressables.find(
      (p: renderer.ReactTestInstance) => p.props.accessibilityLabel === 'Format JSON'
    );
    expect(formatBtn).toBeDefined();
  });

  it('does NOT show a "Format" button for invalid JSON', () => {
    const tree = render(<JsonField value="plain text" onChange={() => {}} />);
    const pressables = tree.root.findAllByType('Pressable' as never);
    const formatBtn = pressables.find(
      (p: renderer.ReactTestInstance) => p.props.accessibilityLabel === 'Format JSON'
    );
    expect(formatBtn).toBeUndefined();
  });

  it('calls onChange with pretty-printed JSON when Format is pressed', () => {
    const onChange = jest.fn();
    const tree = render(<JsonField value='{"a":1,"b":2}' onChange={onChange} />);
    const pressables = tree.root.findAllByType('Pressable' as never);
    const formatBtn = pressables.find(
      (p: renderer.ReactTestInstance) => p.props.accessibilityLabel === 'Format JSON'
    );
    act(() => formatBtn!.props.onPress());
    expect(onChange).toHaveBeenCalledWith(JSON.stringify({ a: 1, b: 2 }, null, 2));
  });

  it('forwards accessibilityLabel to the TextInput', () => {
    const tree = render(
      <JsonField value="" onChange={() => {}} accessibilityLabel="Response body" />
    );
    const inputs = tree.root.findAllByType('TextInput' as never);
    expect(
      inputs.some((i: renderer.ReactTestInstance) => i.props.accessibilityLabel === 'Response body')
    ).toBe(true);
  });
});
