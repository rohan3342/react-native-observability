/**
 * `react-native`'s index.js uses Flow syntax that ts-jest can't parse. We
 * stub every component used by the tab as a tagged passthrough so the React
 * tree mounts and renderer.toJSON() yields an introspectable shape.
 */
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
import { LogsTab } from '../../src/panel/tabs/LogsTab';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import type { DebugPanelContextValue, LogSource } from '../../src/panel/types';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry } from '../../src/logger/types';

function entry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    id: `id-${Math.random()}`,
    timestamp: Date.now(),
    level: LogLevel.INFO,
    namespace: 'app',
    message: 'hello',
    ...overrides,
  };
}

function source(entries: LogEntry[]): LogSource {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => entries,
  };
}

function withCtx(
  logSource: LogSource | null,
  ui: React.ReactElement,
  overrides: Partial<DebugPanelContextValue> = {}
): React.ReactElement {
  const value: DebugPanelContextValue = {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: () => undefined,
    activeTab: 'logs',
    setActiveTab: () => undefined,
    tabs: ['logs'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource,
    networkSource: null,
    screenSource: null,
    registerStateSlice: () => () => undefined,
    stateSliceRegistry: {
      subscribe: () => () => undefined,
      getSnapshot: () => [],
      get: () => undefined,
    },
    ...overrides,
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

function findAll(tree: renderer.ReactTestRenderer, type: string): renderer.ReactTestInstance[] {
  // The mocked RN components render as host-type elements with the given
  // string name. The runtime signature accepts strings, but the published
  // type only declares ElementType — cast to the runtime form.

  return tree.root.findAllByType(type as any);
}

describe('LogsTab — unconfigured source', () => {
  it('renders the empty-state when logSource is null', () => {
    const tree = render(withCtx(null, <LogsTab />));
    const textNodes = findAll(tree, 'Text');
    const combined = textNodes.map(n => stringOf(n)).join(' ');
    expect(combined).toMatch(/No log source configured/);
  });
});

describe('LogsTab — filtering + rendering', () => {
  it('renders one row per entry by default', () => {
    const entries = [
      entry({ id: 'a', message: 'first', namespace: 'auth' }),
      entry({ id: 'b', message: 'second', namespace: 'payments' }),
      entry({ id: 'c', message: 'third', namespace: 'auth' }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/first/);
    expect(text).toMatch(/second/);
    expect(text).toMatch(/third/);
  });

  it('shows newest-first order', () => {
    const t0 = 1000;
    const entries = [
      entry({ id: 'a', message: 'first', timestamp: t0 }),
      entry({ id: 'b', message: 'second', timestamp: t0 + 1 }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    const messages = findAll(tree, 'Text')
      .map(stringOf)
      .filter(s => s === 'first' || s === 'second');
    expect(messages[0]).toBe('second');
  });

  it('shows "No logs yet" empty-state when source is empty', () => {
    const tree = render(withCtx(source([]), <LogsTab />));
    expect(stringTree(tree)).toMatch(/No logs yet/);
  });

  it('shows a namespace chip per distinct namespace in the filter sheet', () => {
    const entries = [
      entry({ id: 'a', message: 'first', namespace: 'auth' }),
      entry({ id: 'b', message: 'second', namespace: 'payments' }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    openFilter(tree);
    const labels = findAll(tree, 'Pressable').map(p => p.props.accessibilityLabel);
    expect(labels).toContain('Namespace auth');
    expect(labels).toContain('Namespace payments');
  });

  it('filters by namespace via the sheet (tap chip → Apply)', () => {
    const entries = [
      entry({ id: 'a', message: 'first', namespace: 'auth' }),
      entry({ id: 'b', message: 'second', namespace: 'payments' }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    openFilter(tree);
    tapChip(tree, 'Namespace payments');
    apply(tree);
    const text = stringTree(tree);
    expect(text).toMatch(/second/);
    expect(text).not.toMatch(/first/);
  });

  it('multi-selects namespaces (auth + payments shows both)', () => {
    const entries = [
      entry({ id: 'a', message: 'first', namespace: 'auth' }),
      entry({ id: 'b', message: 'second', namespace: 'payments' }),
      entry({ id: 'c', message: 'third', namespace: 'orders' }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    openFilter(tree);
    tapChip(tree, 'Namespace auth');
    tapChip(tree, 'Namespace payments');
    apply(tree);
    const text = stringTree(tree);
    expect(text).toMatch(/first/);
    expect(text).toMatch(/second/);
    expect(text).not.toMatch(/third/);
  });

  it('exposes a SCREEN chip per distinct screen in the sheet (T5-1)', () => {
    const entries = [
      entry({ id: 'a', message: 'first', screen: 'Home' }),
      entry({ id: 'b', message: 'second', screen: 'Checkout' }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    openFilter(tree);
    const labels = findAll(tree, 'Pressable').map(p => p.props.accessibilityLabel);
    expect(labels).toContain('Screen Home');
    expect(labels).toContain('Screen Checkout');
  });

  it('has no Screen group when no entry carries a screen (T5-1)', () => {
    const entries = [entry({ id: 'a', message: 'first' }), entry({ id: 'b', message: 'second' })];
    const tree = render(withCtx(source(entries), <LogsTab />));
    openFilter(tree);
    const labels = findAll(tree, 'Pressable').map(p => String(p.props.accessibilityLabel ?? ''));
    expect(labels.some(l => l.startsWith('Screen '))).toBe(false);
  });

  it('filters by screen via the sheet (T5-1)', () => {
    const entries = [
      entry({ id: 'a', message: 'first', screen: 'Home' }),
      entry({ id: 'b', message: 'second', screen: 'Checkout' }),
    ];
    const tree = render(withCtx(source(entries), <LogsTab />));
    openFilter(tree);
    tapChip(tree, 'Screen Checkout');
    apply(tree);
    const text = stringTree(tree);
    expect(text).toMatch(/second/);
    expect(text).not.toMatch(/first/);
  });
});

describe('LogsTab — past session viewing', () => {
  it('shows the selected past session’s persisted logs (not the live source)', () => {
    const live = [entry({ id: 'L', message: 'live-only-log' })];
    const past = [entry({ id: 'P', message: 'old-session-log' })];
    const tree = render(
      withCtx(source(live), <LogsTab />, {
        selectedSessionId: 'sess-old',
        getSessionLogs: (id: string) => (id === 'sess-old' ? past : []),
      })
    );
    const text = stringTree(tree);
    expect(text).toMatch(/old-session-log/); // past session's persisted log
    expect(text).not.toMatch(/live-only-log/); // not the live source
    expect(text).toMatch(/Past session/); // read-only banner
  });

  it('explains when a past session is selected but no reader is wired', () => {
    const tree = render(
      withCtx(source([entry({ message: 'live' })]), <LogsTab />, {
        selectedSessionId: 'sess-old',
        // getSessionLogs intentionally omitted
      })
    );
    const text = stringTree(tree);
    expect(text).toMatch(/Past-session logs unavailable/);
    expect(text).not.toMatch(/live/);
  });
});

// ─── helpers ──────────────────────────────────────────────────────────────

function stringOf(node: renderer.ReactTestInstance): string {
  // react-test-renderer treats children as strings or instances; collect the
  // visible text from leaf string nodes.
  const collect = (children: unknown): string => {
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.map(collect).join('');
    if (children !== null && typeof children === 'object' && 'children' in children) {
      const c = (children as { children: unknown }).children;
      return collect(c);
    }
    return '';
  };
  return collect(node.props.children);
}

function stringTree(tree: renderer.ReactTestRenderer): string {
  return findAll(tree, 'Text').map(stringOf).join(' ');
}

/** Tap a Pressable by exact accessibility label (filter sheet chips / buttons). */
function tap(tree: renderer.ReactTestRenderer, label: string): void {
  const btn = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);
  if (btn === undefined) throw new Error(`pressable "${label}" not found`);
  act(() => btn.props.onPress());
}
const openFilter = (tree: renderer.ReactTestRenderer) => tap(tree, 'Filters');
const apply = (tree: renderer.ReactTestRenderer) => tap(tree, 'Apply');
const tapChip = (tree: renderer.ReactTestRenderer, label: string) => tap(tree, label);
