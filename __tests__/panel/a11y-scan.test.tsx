/**
 * Lightweight accessibility scan (re-adds the coverage gap recorded in plan
 * S19). For each panel tab, every interactive `Pressable` (one with an
 * `onPress`) MUST carry both an `accessibilityRole` and a non-empty
 * `accessibilityLabel` — unless it is explicitly hidden from the a11y tree
 * (e.g. the MultiTapTarget). This is a single combined render per tab, not the
 * heavyweight per-element walk that was previously removed for being slow.
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
    Switch: passthrough('Switch'),
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
      Text: passthrough('Animated.Text'),
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
    Easing: {
      bezier: () => (x: number) => x,
      linear: (x: number) => x,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
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
import { NetworkTab } from '../../src/panel/tabs/NetworkTab';
import { StateTab } from '../../src/panel/tabs/StateTab';
import { NavigationTab } from '../../src/panel/tabs/NavigationTab';
import { SettingsTab } from '../../src/panel/tabs/SettingsTab';
import { ThemeProvider } from '../../src/panel/theme';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import type { DebugPanelContextValue } from '../../src/panel/types';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry } from '../../src/logger/types';
import type { NetworkLogEntry } from '../../src/integrations/http';

function logEntry(): LogEntry {
  return { id: 'l1', timestamp: 1, level: LogLevel.INFO, namespace: 'app', message: 'hi' };
}
function netEntry(): NetworkLogEntry {
  return {
    id: 'n1',
    timestamp: 1,
    method: 'GET',
    url: 'https://api/x',
    source: 'xhr',
    state: 'success',
    statusCode: 200,
    toCurl: () => "curl 'https://api/x'",
  };
}

function ctx(): DebugPanelContextValue {
  // Snapshot references MUST be stable across calls — useSyncExternalStore loops
  // infinitely if getSnapshot returns a fresh array each time (this is what the
  // real MemoryTransport/NetworkLogStore guarantee). Build them once here.
  const logs: readonly LogEntry[] = [logEntry()];
  const nets: readonly NetworkLogEntry[] = [netEntry()];
  const sliceNames: readonly string[] = ['user'];
  // A useSyncExternalStore-compatible subscribe that never notifies.
  const subscribe = (): (() => void) => () => undefined;
  return {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: () => undefined,
    activeTab: 'logs',
    setActiveTab: () => undefined,
    tabs: ['logs', 'network', 'state', 'navigation', 'settings'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource: { subscribe, getSnapshot: () => logs },
    networkSource: { subscribe, getSnapshot: () => nets },
    screenSource: { subscribe, getSnapshot: () => EMPTY_EVENTS, getSummaries: () => [] },
    registerStateSlice: () => () => undefined,
    stateSliceRegistry: {
      subscribe,
      getSnapshot: () => sliceNames,
      get: () => () => ({ id: 1 }),
    },
  };
}

const EMPTY_EVENTS: readonly never[] = [];

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(
      React.createElement(
        DebugPanelContext.Provider,
        { value: ctx() },
        React.createElement(ThemeProvider, null, node)
      )
    );
  });
  return tree!;
}

/** True when an element is explicitly removed from the accessibility tree. */
function isHiddenFromA11y(props: Record<string, unknown>): boolean {
  return (
    props.accessibilityElementsHidden === true ||
    props.importantForAccessibility === 'no-hide-descendants' ||
    props.accessible === false
  );
}

const TABS: ReadonlyArray<{ name: string; el: React.ReactElement }> = [
  { name: 'Logs', el: <LogsTab /> },
  { name: 'Network', el: <NetworkTab /> },
  { name: 'State', el: <StateTab /> },
  { name: 'Navigation', el: <NavigationTab /> },
  { name: 'Settings', el: <SettingsTab /> },
];

describe('panel a11y scan', () => {
  for (const tab of TABS) {
    it(`${tab.name}: every interactive Pressable has role + label`, () => {
      const tree = render(tab.el);
      const pressables = tree.root.findAllByType('Pressable' as never);
      const offenders: string[] = [];
      for (const p of pressables) {
        const props = p.props as Record<string, unknown>;
        if (typeof props.onPress !== 'function') continue; // non-interactive
        if (isHiddenFromA11y(props)) continue; // intentionally hidden
        const role = props.accessibilityRole;
        const label = props.accessibilityLabel;
        if (role === undefined || typeof label !== 'string' || label.trim() === '') {
          offenders.push(JSON.stringify({ role, label }));
        }
      }
      expect(offenders).toEqual([]);
    });

    it(`${tab.name}: every Switch carries an accessibilityLabel (A11Y-2)`, () => {
      const tree = render(tab.el);
      const switches = tree.root.findAllByType('Switch' as never);
      const offenders: string[] = [];
      for (const s of switches) {
        const props = s.props as Record<string, unknown>;
        const label = props.accessibilityLabel;
        if (typeof label !== 'string' || label.trim() === '') {
          offenders.push(JSON.stringify({ value: props.value, label }));
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

// The MockRulesView Switch (A11Y-1) opens on interaction, so scan it directly
// rather than via a default-state tab render.
describe('panel a11y scan — interaction-opened surfaces (A11Y-2)', () => {
  it('MockRulesView: the rule-enable Switch has a label', () => {
    const { MockRulesView } =
      require('../../src/panel/tabs/MockRulesView') as typeof import('../../src/panel/tabs/MockRulesView');
    const { createMockEngine } =
      require('../../src/integrations/http') as typeof import('../../src/integrations/http');
    const engine = createMockEngine({
      rules: [{ id: 'r1', match: { url: '/x' }, action: { type: 'block' } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    const switches = tree.root.findAllByType('Switch' as never);
    expect(switches.length).toBeGreaterThan(0);
    for (const s of switches) {
      const label = (s.props as Record<string, unknown>).accessibilityLabel;
      expect(typeof label === 'string' && label.trim() !== '').toBe(true);
    }
  });
});
