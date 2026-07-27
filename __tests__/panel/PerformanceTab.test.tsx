jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PerformanceTab } from '../../src/panel/tabs/PerformanceTab';
import { ThemeProvider } from '../../src/panel/theme';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import type { DebugPanelContextValue, NetworkSource } from '../../src/panel/types';
import type { NetworkLogEntry } from '../../src/integrations/http';
import { getPerfStore, trackPerformance } from '../../src/integrations/perf';
import { _resetPerfStore } from '../../src/integrations/perf/PerfStore';

beforeEach(() => {
  _resetPerfStore();
});

function netEntry(over: Partial<NetworkLogEntry>): NetworkLogEntry {
  return {
    id: `id-${Math.random()}`,
    timestamp: 0,
    method: 'GET',
    url: '/users/1',
    source: 'xhr',
    state: 'success',
    statusCode: 200,
    durationMs: 120,
    toCurl: () => '',
    ...over,
  };
}

function ctx(networkSource: NetworkSource | null): DebugPanelContextValue {
  const subscribe = (): (() => void) => () => undefined;
  return {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: () => undefined,
    activeTab: 'performance',
    setActiveTab: () => undefined,
    tabs: ['performance'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource: null,
    networkSource,
    screenSource: null,
    registerStateSlice: () => () => undefined,
    stateSliceRegistry: { subscribe, getSnapshot: () => [], get: () => undefined },
  };
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

function renderWith(networkSource: NetworkSource | null): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(
      React.createElement(
        DebugPanelContext.Provider,
        { value: ctx(networkSource) },
        React.createElement(ThemeProvider, null, React.createElement(PerformanceTab))
      )
    );
  });
  return tree!;
}

const staticSource = (entries: readonly NetworkLogEntry[]): NetworkSource => ({
  subscribe: () => () => undefined,
  getSnapshot: () => entries,
});

/** Tap a segmented option by its accessibility label (e.g. "Endpoints", "Spans"). */
function tapSegment(tree: renderer.ReactTestRenderer, label: string): void {
  const btn = tree.root
    .findAllByType('Pressable' as never)
    .find(
      p => String((p.props as { accessibilityLabel?: string }).accessibilityLabel ?? '') === label
    );
  if (btn === undefined) throw new Error(`segment "${label}" not found`);
  act(() => (btn.props as { onPress?: () => void }).onPress?.());
}

describe('PerformanceTab', () => {
  it('defaults to the Endpoints view and shows its empty state with no data', () => {
    const tree = renderWith(staticSource([]));
    expect(text(tree)).toContain('No completed requests');
    // Spans view is not mounted until toggled.
    expect(text(tree)).not.toContain('No spans recorded');
  });

  it('shows the Spans empty state after toggling to the Spans view', () => {
    const tree = renderWith(staticSource([]));
    tapSegment(tree, 'Spans');
    expect(text(tree)).toContain('No spans recorded');
    expect(text(tree)).not.toContain('No completed requests');
  });

  it('renders per-endpoint HTTP stats in the Endpoints view', () => {
    const tree = renderWith(
      staticSource([
        netEntry({ url: '/users/1', durationMs: 100 }),
        netEntry({ url: '/users/2', durationMs: 300 }),
      ])
    );
    const t = text(tree);
    expect(t).toContain('GET /users/:id');
    // Column labels rendered once in the header strip
    expect(t).toContain('n');
    expect(t).toContain('p50');
    expect(t).toContain('p95');
    expect(t).toContain('max');
    expect(t).toContain('err');
    expect(t).toContain('ms');
  });

  it('shows the info button when there are endpoints', () => {
    const tree = renderWith(staticSource([netEntry({ url: '/users/1', durationMs: 100 })]));
    const btn = tree.root
      .findAllByType('Pressable' as never)
      .find(
        p =>
          String((p.props as { accessibilityLabel?: string }).accessibilityLabel ?? '') ===
          'Metric definitions'
      );
    expect(btn).toBeDefined();
  });

  it('opens the metric legend sheet when the info button is pressed', () => {
    const tree = renderWith(staticSource([netEntry({ url: '/users/1', durationMs: 100 })]));
    const btn = tree.root
      .findAllByType('Pressable' as never)
      .find(
        p =>
          String((p.props as { accessibilityLabel?: string }).accessibilityLabel ?? '') ===
          'Metric definitions'
      );
    act(() => (btn!.props as { onPress?: () => void }).onPress?.());
    const t = text(tree);
    expect(t).toContain('Metric definitions');
    expect(t).toContain('Median');
  });

  it('renders recorded perf spans in the Spans view', () => {
    trackPerformance('decode', { store: getPerfStore() }).end();
    const tree = renderWith(staticSource([]));
    tapSegment(tree, 'Spans');
    expect(text(tree)).toContain('decode');
  });

  it('shows the view counts on the segmented control', () => {
    trackPerformance('decode', { store: getPerfStore() }).end();
    const tree = renderWith(staticSource([netEntry({ url: '/users/1' })]));
    const t = text(tree);
    // Segmented renders counts as "(n)".
    expect(t).toContain('Endpoints (1)');
    expect(t).toContain('Spans (1)');
  });
});
