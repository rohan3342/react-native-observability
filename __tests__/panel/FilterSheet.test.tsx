jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const passthrough = (name: string) =>
    function Stub(props: { children?: React.ReactNode }) {
      return React.createElement(name, props, props.children);
    };
  return {
    View: passthrough('View'),
    Text: passthrough('Text'),
    Pressable: passthrough('Pressable'),
    ScrollView: passthrough('ScrollView'),
    Animated: {
      View: passthrough('Animated.View'),
      timing: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
      }),
      spring: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
      }),
      parallel: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
      }),
      Value: class {
        constructor(public v: number) {}
        interpolate() {
          return this;
        }
      },
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined }),
    },
    BackHandler: { addEventListener: () => ({ remove: () => undefined }) },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(s: T) => s,
      absoluteFillObject: {},
      hairlineWidth: 1,
    },
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { FilterSheet, FilterButton } from '../../src/panel/components/FilterSheet';
import type { FilterGroup, FilterSelections } from '../../src/panel/components/FilterSheet';
import { ThemeProvider } from '../../src/panel/theme';

const GROUPS: FilterGroup[] = [
  { key: 'namespace', label: 'Namespace', options: [{ value: 'auth' }, { value: 'payments' }] },
  { key: 'screen', label: 'Screen', options: [{ value: 'Home' }] },
];

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
function tap(tree: renderer.ReactTestRenderer, label: string): void {
  const btn = findAll(tree, 'Pressable').find(
    (p: { props: { accessibilityLabel?: string } }) =>
      String(p.props.accessibilityLabel ?? '') === label
  );
  if (btn === undefined) throw new Error(`pressable "${label}" not found`);
  act(() => (btn.props as { onPress?: () => void }).onPress?.());
}

describe('FilterSheet', () => {
  it('renders a chip per option across groups', () => {
    const tree = render(
      <FilterSheet
        visible
        groups={GROUPS}
        selections={{}}
        onApply={() => undefined}
        onClear={() => undefined}
        onClose={() => undefined}
      />
    );
    const labels = findAll(tree, 'Pressable').map(p => p.props.accessibilityLabel);
    expect(labels).toContain('Namespace auth');
    expect(labels).toContain('Namespace payments');
    expect(labels).toContain('Screen Home');
  });

  it('stages selections and only commits on Apply (multi-select)', () => {
    let applied: FilterSelections | null = null;
    const tree = render(
      <FilterSheet
        visible
        groups={GROUPS}
        selections={{}}
        onApply={s => (applied = s)}
        onClear={() => undefined}
        onClose={() => undefined}
      />
    );
    tap(tree, 'Namespace auth');
    tap(tree, 'Namespace payments');
    expect(applied).toBeNull(); // not committed until Apply
    tap(tree, 'Apply');
    expect(applied).not.toBeNull();
    expect(applied!.namespace).toEqual(['auth', 'payments']);
  });

  it('toggles a chip off when tapped twice', () => {
    let applied: FilterSelections | null = null;
    const tree = render(
      <FilterSheet
        visible
        groups={GROUPS}
        selections={{}}
        onApply={s => (applied = s)}
        onClear={() => undefined}
        onClose={() => undefined}
      />
    );
    tap(tree, 'Namespace auth');
    tap(tree, 'Namespace auth'); // toggle off
    tap(tree, 'Apply');
    expect(applied!.namespace).toEqual([]);
  });

  it('seeds the draft from applied selections', () => {
    let applied: FilterSelections | null = null;
    const tree = render(
      <FilterSheet
        visible
        groups={GROUPS}
        selections={{ namespace: ['auth'] }}
        onApply={s => (applied = s)}
        onClear={() => undefined}
        onClose={() => undefined}
      />
    );
    // 'auth' is pre-selected; tapping 'payments' should add to it.
    tap(tree, 'Namespace payments');
    tap(tree, 'Apply');
    expect(applied!.namespace).toEqual(['auth', 'payments']);
  });

  it('Clear empties every group and calls onClear', () => {
    const onClear = jest.fn();
    const tree = render(
      <FilterSheet
        visible
        groups={GROUPS}
        selections={{ namespace: ['auth'] }}
        onApply={() => undefined}
        onClear={onClear}
        onClose={() => undefined}
      />
    );
    tap(tree, 'Clear (1)');
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('FilterButton', () => {
  it('shows a plain label with no active filters', () => {
    const tree = render(<FilterButton count={0} onPress={() => undefined} />);
    const btn = findAll(tree, 'Pressable')[0];
    expect(btn?.props.accessibilityLabel).toBe('Filters');
  });

  it('shows the active count', () => {
    const onPress = jest.fn();
    const tree = render(<FilterButton count={3} onPress={onPress} />);
    const btn = findAll(tree, 'Pressable')[0];
    expect(btn?.props.accessibilityLabel).toBe('Filters, 3 active');
    act(() => btn!.props.onPress());
    expect(onPress).toHaveBeenCalled();
  });
});
