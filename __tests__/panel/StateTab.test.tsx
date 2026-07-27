jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StateTab } from '../../src/panel/tabs/StateTab';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import { SliceRegistry } from '../../src/panel/SliceRegistry';
import { FeatureFlagManager } from '../../src/config';
import type { DebugPanelContextValue } from '../../src/panel/types';

function withCtx(registry: SliceRegistry, ui: React.ReactElement): React.ReactElement {
  const value: DebugPanelContextValue = {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: () => undefined,
    activeTab: 'state',
    setActiveTab: () => undefined,
    tabs: ['state'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource: null,
    networkSource: null,
    screenSource: null,
    registerStateSlice: (name, sel) => registry.register(name, sel),
    stateSliceRegistry: registry,
  };
  return React.createElement(DebugPanelContext.Provider, { value }, ui);
}

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

function findAll(tree: renderer.ReactTestRenderer, type: string) {
  return tree.root.findAllByType(type as any);
}

function stringOf(node: { props: { children?: unknown } }): string {
  const collect = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(collect).join('');
    if (c !== null && typeof c === 'object' && 'children' in c) {
      return collect((c as { children: unknown }).children);
    }
    return '';
  };
  return collect(node.props.children);
}

function stringTree(tree: renderer.ReactTestRenderer): string {
  return findAll(tree, 'Text').map(stringOf).join(' ');
}

/** Press a CollapsibleSection header to expand it (label match is a prefix). */
function expandSection(tree: renderer.ReactTestRenderer, label: string): void {
  const header = findAll(tree, 'Pressable').find(p =>
    String(p.props.accessibilityLabel ?? '').startsWith(`${label},`)
  );
  act(() => {
    header?.props.onPress?.();
  });
}

afterEach(() => {
  FeatureFlagManager.reset();
});

describe('StateTab — slices view', () => {
  it('shows empty-state when no slices are registered', () => {
    const tree = render(withCtx(new SliceRegistry(), <StateTab />));
    expect(stringTree(tree)).toMatch(/No state slices registered/);
  });

  it('renders one card per registered slice', () => {
    const registry = new SliceRegistry();
    registry.register('user', () => ({ id: 1, name: 'Ada' }));
    registry.register('cart', () => ({ items: [] }));
    const tree = render(withCtx(registry, <StateTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/user/);
    expect(text).toMatch(/cart/);
  });

  it('shows object slice keys as a scannable key list when expanded', () => {
    const registry = new SliceRegistry();
    registry.register('user', () => ({ id: 42, name: 'Ada' }));
    const tree = render(withCtx(registry, <StateTab />));
    expandSection(tree, 'user');
    const text = stringTree(tree);
    // Keys are shown with compacted previews (not raw multi-line JSON).
    expect(text).toMatch(/id/);
    expect(text).toMatch(/name/);
    expect(text).toMatch(/"Ada"/);
  });

  it('collapses object slices by default (keys hidden until expanded)', () => {
    const registry = new SliceRegistry();
    registry.register('user', () => ({ secretKey: 'hidden-until-open' }));
    const tree = render(withCtx(registry, <StateTab />));
    // Label is visible, value is not, until the section is expanded.
    expect(stringTree(tree)).toMatch(/user/);
    expect(stringTree(tree)).not.toMatch(/hidden-until-open/);
    expandSection(tree, 'user');
    expect(stringTree(tree)).toMatch(/hidden-until-open/);
  });

  it('handles a selector that throws gracefully (shown expanded)', () => {
    const registry = new SliceRegistry();
    registry.register('boom', () => {
      throw new Error('selector failed');
    });
    const tree = render(withCtx(registry, <StateTab />));
    // Non-object fallback renders expanded by default.
    expect(stringTree(tree)).toMatch(/selector threw: selector failed/);
  });

  it('handles circular references without throwing', () => {
    const registry = new SliceRegistry();
    const cyclic: Record<string, unknown> = { name: 'x' };
    cyclic['self'] = cyclic;
    registry.register('cyclic', () => cyclic);
    const tree = render(withCtx(registry, <StateTab />));
    expandSection(tree, 'cyclic');
    // The 'self' key's preview summarises the circular object.
    expect(stringTree(tree)).toMatch(/self/);
  });

  it('handles functions and BigInts in key previews', () => {
    const registry = new SliceRegistry();
    registry.register('mixed', () => ({
      fn: () => 1,
      big: BigInt(42),
    }));
    const tree = render(withCtx(registry, <StateTab />));
    expandSection(tree, 'mixed');
    const text = stringTree(tree);
    expect(text).toMatch(/<function>/); // function leaf
    expect(text).toMatch(/42n/); // bigint leaf (JsonTree renders bigints with an n suffix)
  });
});

describe('StateTab — flags view', () => {
  it('shows empty-state when no flags are known', () => {
    const tree = render(withCtx(new SliceRegistry(), <StateTab />));
    // Switch to flags view via accessibility-label lookup
    const flagsChip = findAll(tree, 'Pressable').find(
      p => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel === 'Flags'
    );
    act(() => {
      flagsChip!.props.onPress();
    });
    expect(stringTree(tree)).toMatch(/No feature flags registered/);
  });

  it('renders one row per known flag', () => {
    FeatureFlagManager.init({ flag_a: true, flag_b: false });
    const tree = render(withCtx(new SliceRegistry(), <StateTab />));
    const flagsChip = findAll(tree, 'Pressable').find(
      p => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel === 'Flags'
    );
    act(() => {
      flagsChip!.props.onPress();
    });
    const text = stringTree(tree);
    expect(text).toMatch(/flag_a/);
    expect(text).toMatch(/flag_b/);
  });

  it('toggling a Switch sets an override on FeatureFlagManager', () => {
    FeatureFlagManager.init({ my_flag: false });
    const tree = render(withCtx(new SliceRegistry(), <StateTab />));
    const flagsChip = findAll(tree, 'Pressable').find(
      p => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel === 'Flags'
    );
    act(() => {
      flagsChip!.props.onPress();
    });

    const sw = findAll(tree, 'Switch')[0];
    expect(sw).toBeDefined();
    expect(sw!.props.value).toBe(false);

    act(() => {
      sw!.props.onValueChange(true);
    });

    expect(FeatureFlagManager.isEnabled('my_flag')).toBe(true);
    expect(FeatureFlagManager.hasOverride('my_flag')).toBe(true);
  });

  it('clear-override badge appears for overridden flags and clears on tap', () => {
    FeatureFlagManager.init({ my_flag: false });
    FeatureFlagManager.override('my_flag', true);

    const tree = render(withCtx(new SliceRegistry(), <StateTab />));
    const flagsChip = findAll(tree, 'Pressable').find(
      p => typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel === 'Flags'
    );
    act(() => {
      flagsChip!.props.onPress();
    });

    const overrideBtn = findAll(tree, 'Pressable').find(
      p =>
        typeof p.props.accessibilityLabel === 'string' &&
        p.props.accessibilityLabel.startsWith('Clear override on')
    );
    expect(overrideBtn).toBeDefined();

    act(() => {
      overrideBtn!.props.onPress();
    });

    expect(FeatureFlagManager.hasOverride('my_flag')).toBe(false);
    expect(FeatureFlagManager.isEnabled('my_flag')).toBe(false); // back to seeded value
  });
});

describe('StateTab — view toggle chip counts', () => {
  it('shows slice count and flag count on chips', () => {
    FeatureFlagManager.init({ a: true, b: false });
    const registry = new SliceRegistry();
    registry.register('slice1', () => 1);
    const tree = render(withCtx(registry, <StateTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/Slices \(1\)/);
    expect(text).toMatch(/Flags \(2\)/);
  });
});
