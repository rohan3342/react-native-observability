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
    Modal: passthrough('Modal'),
    TextInput: passthrough('TextInput'),
    FlatList: function FlatListStub(props: {
      data: readonly unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      keyExtractor: (item: unknown, index: number) => string;
    }) {
      return React.createElement(
        'FlatList',
        null,
        props.data.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: props.keyExtractor(item, index) },
            props.renderItem({ item, index })
          )
        )
      );
    },
    Share: { share: jest.fn(() => Promise.resolve()) },
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
      Value: class {
        constructor(public v: number) {}
        setValue() {}
        interpolate() {
          return this;
        }
      },
      timing: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined }),
    },
    BackHandler: { addEventListener: () => ({ remove: () => undefined }) },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(s: T) => s,
      absoluteFill: {},
      absoluteFillObject: {},
      hairlineWidth: 1,
    },
  };
});

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { NavigationTab } from '../../src/panel/tabs/NavigationTab';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import type { DebugPanelContextValue, ScreenSource } from '../../src/panel/types';
import type { ScreenLifecycleEvent, ScreenSummary } from '../../src/integrations/screen';

function source(events: ScreenLifecycleEvent[], summaries: ScreenSummary[]): ScreenSource {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => events,
    getSummaries: () => summaries,
  };
}

function withCtx(screenSource: ScreenSource | null, ui: React.ReactElement): React.ReactElement {
  const value: DebugPanelContextValue = {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: () => undefined,
    activeTab: 'navigation',
    setActiveTab: () => undefined,
    tabs: ['navigation'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource: null,
    networkSource: null,
    screenSource,
    registerStateSlice: () => () => undefined,
    stateSliceRegistry: {
      subscribe: () => () => undefined,
      getSnapshot: () => [],
      get: () => undefined,
    },
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

describe('NavigationTab — unconfigured source', () => {
  it('renders the empty-state when screenSource is null', () => {
    const tree = render(withCtx(null, <NavigationTab />));
    expect(stringTree(tree)).toMatch(/No screen source configured/);
  });
});

describe('NavigationTab — summary view (default)', () => {
  it('shows "No screens tracked yet" when summaries are empty', () => {
    const tree = render(withCtx(source([], []), <NavigationTab />));
    expect(stringTree(tree)).toMatch(/No screens tracked yet/);
  });

  it('renders one row per summary', () => {
    const summaries: ScreenSummary[] = [
      { screen: 'Home', mountCount: 2, currentlyMounted: true, totalTimeMs: 1500 },
      { screen: 'Settings', mountCount: 1, currentlyMounted: false, totalTimeMs: 800 },
    ];
    const tree = render(withCtx(source([], summaries), <NavigationTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/Home/);
    expect(text).toMatch(/Settings/);
  });

  it('renders the LIVE badge for currently-mounted screens', () => {
    const summaries: ScreenSummary[] = [
      { screen: 'Active', mountCount: 1, currentlyMounted: true, totalTimeMs: 100 },
      { screen: 'Inactive', mountCount: 1, currentlyMounted: false, totalTimeMs: 200 },
    ];
    const tree = render(withCtx(source([], summaries), <NavigationTab />));
    expect(stringTree(tree)).toMatch(/LIVE/);
  });

  it('formats sub-second time-on-screen as ms and >=1s as fractional s', () => {
    const summaries: ScreenSummary[] = [
      { screen: 'Quick', mountCount: 1, currentlyMounted: false, totalTimeMs: 250 },
      { screen: 'Long', mountCount: 1, currentlyMounted: false, totalTimeMs: 12500 },
    ];
    const tree = render(withCtx(source([], summaries), <NavigationTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/250ms/);
    expect(text).toMatch(/12\.5s/);
  });
});

describe('NavigationTab — history view (toggle)', () => {
  it('renders MOUNT and UNMOUNT rows when History is selected', () => {
    const events: ScreenLifecycleEvent[] = [
      { screen: 'Home', event: 'mount', timestamp: 1000 },
      { screen: 'Home', event: 'unmount', timestamp: 2000 },
    ];
    const tree = render(withCtx(source(events, []), <NavigationTab />));

    // Find the "History" chip by accessibility label and press it.
    const historyChip = findAll(tree, 'Pressable').find(
      p =>
        typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel === 'History'
    );
    expect(historyChip).toBeDefined();
    act(() => {
      historyChip!.props.onPress();
    });

    const text = stringTree(tree);
    expect(text).toMatch(/MOUNT/);
    expect(text).toMatch(/UNMOUNT/);
  });

  it('shows newest event first in the history view', () => {
    const events: ScreenLifecycleEvent[] = [
      { screen: 'First', event: 'mount', timestamp: 1000 },
      { screen: 'Second', event: 'mount', timestamp: 2000 },
    ];
    const tree = render(withCtx(source(events, []), <NavigationTab />));
    const historyChip = findAll(tree, 'Pressable').find(
      p =>
        typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel === 'History'
    );
    act(() => {
      historyChip!.props.onPress();
    });

    const titleNodes = findAll(tree, 'Text')
      .map(stringOf)
      .filter(s => s === 'First' || s === 'Second');
    expect(titleNodes[0]).toBe('Second');
  });
});

describe('NavigationTab — view toggle chips', () => {
  it('shows summary and history counts on the chips', () => {
    const events: ScreenLifecycleEvent[] = [
      { screen: 'A', event: 'mount', timestamp: 1000 },
      { screen: 'A', event: 'unmount', timestamp: 2000 },
      { screen: 'B', event: 'mount', timestamp: 3000 },
    ];
    const summaries: ScreenSummary[] = [
      { screen: 'A', mountCount: 1, currentlyMounted: false, totalTimeMs: 1000 },
      { screen: 'B', mountCount: 1, currentlyMounted: true, totalTimeMs: 0 },
    ];
    const tree = render(withCtx(source(events, summaries), <NavigationTab />));
    const text = stringTree(tree);
    // FilterChip renders "<label> (<count>)"
    expect(text).toMatch(/Summary \(2\)/);
    expect(text).toMatch(/History \(3\)/);
  });
});
