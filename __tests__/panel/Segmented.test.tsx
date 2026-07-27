jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Segmented } from '../../src/panel/components/Segmented';
import { ThemeProvider } from '../../src/panel/theme';

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
function text(tree: renderer.ReactTestRenderer): string {
  const collect = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(collect).join('');
    if (c !== null && typeof c === 'object' && 'children' in c)
      return collect((c as { children: unknown }).children);
    return '';
  };
  return tree.root
    .findAllByType('Text' as never)
    .map(n => collect(n.props.children))
    .join(' ');
}

describe('Segmented', () => {
  const opts = [
    { value: 'requests' as const, label: 'Requests' },
    { value: 'rules' as const, label: 'Rules', count: 2 },
  ];

  it('renders each option, appending counts as (n)', () => {
    const tree = render(<Segmented value="requests" onChange={() => {}} options={opts} />);
    const t = text(tree);
    expect(t).toContain('Requests');
    expect(t).toContain('Rules (2)');
  });

  it('marks the active segment selected', () => {
    const tree = render(<Segmented value="rules" onChange={() => {}} options={opts} />);
    const rules = pressables(tree).find(p => p.props.accessibilityLabel === 'Rules');
    expect(rules?.props.accessibilityState).toEqual({ selected: true });
  });

  it('calls onChange with the tapped value', () => {
    const onChange = jest.fn();
    const tree = render(<Segmented value="requests" onChange={onChange} options={opts} />);
    const rules = pressables(tree).find(p => p.props.accessibilityLabel === 'Rules');
    act(() => rules!.props.onPress());
    expect(onChange).toHaveBeenCalledWith('rules');
  });

  // Regression guard (device error: "Style property 'width' is not supported by
  // native animated module"). The sliding thumb must animate `left`/`width` on
  // the JS driver, never a `transform`/native-driver path that can't size width.
  it('positions the thumb with left + width, not a transform', () => {
    const tree = render(<Segmented value="requests" onChange={() => {}} options={opts} />);
    // Feed a layout to each segment so the thumb appears.
    act(() => {
      pressables(tree).forEach((p, i) => {
        p.props.onLayout?.({ nativeEvent: { layout: { x: i * 80, y: 0, width: 80, height: 36 } } });
      });
    });
    // The thumb is the absolutely-positioned fill with a `left` style key.
    const flatten = (s: unknown): Record<string, unknown> =>
      Object.assign({}, ...([] as unknown[]).concat(s).filter(Boolean));
    const thumb = tree.root
      .findAllByType('View' as never)
      .map(n => flatten(n.props.style))
      .find(s => s.position === 'absolute' && 'left' in s);
    expect(thumb).toBeDefined();
    expect(thumb).toHaveProperty('width');
    expect(thumb!.transform).toBeUndefined();
  });
});
