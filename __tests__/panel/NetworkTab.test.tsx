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
import { NetworkTab } from '../../src/panel/tabs/NetworkTab';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import type { DebugPanelContextValue, NetworkSource } from '../../src/panel/types';
import type { NetworkLogEntry } from '../../src/integrations/http';

function makeEntry(overrides: Partial<NetworkLogEntry> = {}): NetworkLogEntry {
  return {
    id: `id-${Math.random()}`,
    timestamp: Date.now(),
    method: 'GET',
    url: 'https://api.example.com/items',
    source: 'xhr',
    state: 'pending',
    toCurl: () => `curl -X GET 'https://api.example.com/items'`,
    ...overrides,
  };
}

function source(entries: NetworkLogEntry[]): NetworkSource {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => entries,
  };
}

function withCtx(networkSource: NetworkSource | null, ui: React.ReactElement): React.ReactElement {
  const value: DebugPanelContextValue = {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: () => undefined,
    activeTab: 'network',
    setActiveTab: () => undefined,
    tabs: ['network'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource: null,
    networkSource,
    screenSource: null,
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

/** Tap a Pressable by exact accessibility label (filter sheet chips / buttons). */
function tap(tree: renderer.ReactTestRenderer, label: string): void {
  const btn = findAll(tree, 'Pressable').find(
    (p: { props: { accessibilityLabel?: string } }) =>
      String(p.props.accessibilityLabel ?? '') === label
  );
  if (btn === undefined) throw new Error(`pressable "${label}" not found`);
  act(() => btn.props.onPress());
}
const openFilter = (tree: renderer.ReactTestRenderer) => tap(tree, 'Filters');
const applyFilter = (tree: renderer.ReactTestRenderer) => tap(tree, 'Apply');

describe('NetworkTab — unconfigured source', () => {
  it('renders the empty-state when networkSource is null', () => {
    const tree = render(withCtx(null, <NetworkTab />));
    expect(stringTree(tree)).toMatch(/No network source configured/);
  });
});

describe('NetworkTab — rendering', () => {
  it('renders one row per entry by default', () => {
    const entries = [
      makeEntry({
        id: 'a',
        url: 'https://api.example.com/posts/1',
        state: 'success',
        statusCode: 200,
      }),
      makeEntry({ id: 'b', url: 'https://api.example.com/users', state: 'error', statusCode: 500 }),
    ];
    const tree = render(withCtx(source(entries), <NetworkTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/posts\/1/);
    expect(text).toMatch(/users/);
  });

  it('shows newest-first order', () => {
    const t0 = 1000;
    const entries = [
      makeEntry({
        id: 'a',
        url: 'https://api.example.com/first',
        timestamp: t0,
        state: 'success',
        statusCode: 200,
      }),
      makeEntry({
        id: 'b',
        url: 'https://api.example.com/second',
        timestamp: t0 + 1,
        state: 'success',
        statusCode: 200,
      }),
    ];
    const tree = render(withCtx(source(entries), <NetworkTab />));
    const urls = findAll(tree, 'Text')
      .map(stringOf)
      .filter(s => s.includes('first') || s.includes('second'));
    expect(urls[0]).toMatch(/second/);
  });

  it('shows the empty-state when source has no entries', () => {
    const tree = render(withCtx(source([]), <NetworkTab />));
    expect(stringTree(tree)).toMatch(/No network activity yet/);
  });

  it('formats pending state as "…"', () => {
    const entries = [makeEntry({ id: 'a', state: 'pending' })];
    const tree = render(withCtx(source(entries), <NetworkTab />));
    expect(stringTree(tree)).toMatch(/…/);
  });

  it('formats successful entries with their status code', () => {
    const entries = [makeEntry({ id: 'a', state: 'success', statusCode: 201 })];
    const tree = render(withCtx(source(entries), <NetworkTab />));
    expect(stringTree(tree)).toMatch(/201/);
  });

  it('narrows by method via the filter sheet (tap Method chip → Apply)', () => {
    const entries = [
      makeEntry({
        id: 'a',
        method: 'GET',
        url: 'https://api/a/list',
        state: 'success',
        statusCode: 200,
      }),
      makeEntry({
        id: 'b',
        method: 'POST',
        url: 'https://api/a/create',
        state: 'success',
        statusCode: 201,
      }),
    ];
    const tree = render(withCtx(source(entries), <NetworkTab />));
    openFilter(tree);
    tap(tree, 'Method POST');
    applyFilter(tree);
    const text = stringTree(tree);
    expect(text).toMatch(/a\/create/);
    expect(text).not.toMatch(/a\/list/);
  });

  it('narrows by screen via the filter sheet', () => {
    const entries = [
      makeEntry({
        id: 'a',
        url: 'https://api/home/x',
        screen: 'Home',
        state: 'success',
        statusCode: 200,
      }),
      makeEntry({
        id: 'b',
        url: 'https://api/checkout/y',
        screen: 'Checkout',
        state: 'success',
        statusCode: 200,
      }),
    ];
    const tree = render(withCtx(source(entries), <NetworkTab />));
    openFilter(tree);
    // The sheet exposes a Screen chip per distinct screen.
    const labels = findAll(tree, 'Pressable').map(p => String(p.props.accessibilityLabel ?? ''));
    expect(labels).toContain('Screen Home');
    expect(labels).toContain('Screen Checkout');
    tap(tree, 'Screen Checkout');
    applyFilter(tree);
    const text = stringTree(tree);
    expect(text).toMatch(/checkout\/y/);
    expect(text).not.toMatch(/home\/x/);
  });

  it('does not expose a Screen chip for untagged entries', () => {
    const entries = [makeEntry({ id: 'a', url: 'https://api/x' })]; // no screen
    const tree = render(withCtx(source(entries), <NetworkTab />));
    openFilter(tree);
    const labels = findAll(tree, 'Pressable').map(p => String(p.props.accessibilityLabel ?? ''));
    expect(labels.some(l => l.startsWith('Screen '))).toBe(false);
  });
});

describe('NetworkTab — bulk export (T5-3)', () => {
  it('shows an "Export all" button with the shown count when entries exist', () => {
    const tree = render(
      withCtx(source([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]), <NetworkTab />)
    );
    const text = stringTree(tree);
    expect(text).toContain('2 shown');
    const exportAll = findAll(tree, 'Pressable').find(
      p => String(p.props.accessibilityLabel ?? '') === 'Export all shown requests'
    );
    expect(exportAll).toBeDefined();
  });

  it('does not show "Export all" when there are no entries', () => {
    const tree = render(withCtx(source([]), <NetworkTab />));
    const exportAll = findAll(tree, 'Pressable').find(
      p => String(p.props.accessibilityLabel ?? '') === 'Export all shown requests'
    );
    expect(exportAll).toBeUndefined();
  });

  it('shares a bundle of every shown request', () => {
    const { Share } = require('react-native') as { Share: { share: jest.Mock } };
    Share.share.mockClear();
    const entries = [
      makeEntry({ id: 'a', url: 'https://api.example.com/first' }),
      makeEntry({ id: 'b', url: 'https://api.example.com/second' }),
    ];
    const tree = render(withCtx(source(entries), <NetworkTab />));

    const exportAll = findAll(tree, 'Pressable').find(
      p => String(p.props.accessibilityLabel ?? '') === 'Export all shown requests'
    );
    act(() => {
      exportAll?.props.onPress?.();
    });

    expect(Share.share).toHaveBeenCalledTimes(1);
    const msg = Share.share.mock.calls[0][0].message as string;
    expect(msg).toContain('Observability network export — 2 requests');
    expect(msg).toContain('/first');
    expect(msg).toContain('/second');
  });

  it('exports only the filtered subset when a filter is active', () => {
    const { Share } = require('react-native') as { Share: { share: jest.Mock } };
    Share.share.mockClear();
    const entries = [
      makeEntry({ id: 'a', method: 'GET', url: 'https://api.example.com/list' }),
      makeEntry({ id: 'b', method: 'POST', url: 'https://api.example.com/create' }),
    ];
    const tree = render(withCtx(source(entries), <NetworkTab />));

    // Narrow to POST via the filter sheet, then export — only POST in the bundle.
    openFilter(tree);
    tap(tree, 'Method POST');
    applyFilter(tree);

    const exportAll = findAll(tree, 'Pressable').find(
      p => String(p.props.accessibilityLabel ?? '') === 'Export all shown requests'
    );
    act(() => {
      exportAll?.props.onPress?.();
    });

    const msg = Share.share.mock.calls[0][0].message as string;
    expect(msg).toContain('1 request');
    expect(msg).toContain('/create');
    expect(msg).not.toContain('/list');
  });
});

describe('NetworkTab — detail sheet actions & sections', () => {
  function openFirstRow(tree: renderer.ReactTestRenderer): void {
    // The row Pressable carries an accessibilityLabel beginning with the method.
    const row = findAll(tree, 'Pressable').find(p =>
      String(p.props.accessibilityLabel ?? '').startsWith('GET ')
    );
    act(() => {
      row?.props.onPress?.();
    });
  }

  const detailedEntry = makeEntry({
    id: 'a',
    state: 'success',
    statusCode: 200,
    durationMs: 50,
    requestHeaders: { Authorization: '[REDACTED]' },
    requestBody: { q: 1 },
    responseHeaders: { 'content-type': 'application/json' },
    responseBody: { ok: true },
  });

  it('shows cURL + Export actions and all section headers when a row is opened', () => {
    const tree = render(withCtx(source([detailedEntry]), <NetworkTab />));
    openFirstRow(tree);
    const text = stringTree(tree);
    expect(text).toContain('cURL');
    expect(text).toContain('Export');
    expect(text).toContain('Request Headers');
    expect(text).toContain('Request Body');
    expect(text).toContain('Response Headers');
    expect(text).toContain('Response Body');
  });

  it('renders a JSON response body as a drillable tree (expanded by default)', () => {
    const tree = render(withCtx(source([detailedEntry]), <NetworkTab />));
    openFirstRow(tree);
    const text = stringTree(tree);
    // responseBody { ok: true } → tree shows the key and typed leaf.
    expect(text).toContain('ok');
    expect(text).toContain('true');
  });

  it('Export action shares the full formatted request', () => {
    const { Share } = require('react-native') as { Share: { share: jest.Mock } };
    Share.share.mockClear();
    const tree = render(withCtx(source([detailedEntry]), <NetworkTab />));
    openFirstRow(tree);

    const exportBtn = findAll(tree, 'Pressable').find(
      p => String(p.props.accessibilityLabel ?? '') === '↥ Export'
    );
    act(() => {
      exportBtn?.props.onPress?.();
    });

    expect(Share.share).toHaveBeenCalledTimes(1);
    const msg = Share.share.mock.calls[0][0].message as string;
    expect(msg).toContain('── Response Body ──');
    expect(msg).toContain('── cURL ──');
  });

  it('a per-section copy button shares just that section', () => {
    const { Share } = require('react-native') as { Share: { share: jest.Mock } };
    Share.share.mockClear();
    const tree = render(withCtx(source([detailedEntry]), <NetworkTab />));
    openFirstRow(tree);

    const copyReqHeaders = findAll(tree, 'Pressable').find(
      p => String(p.props.accessibilityLabel ?? '') === 'Copy Request Headers'
    );
    act(() => {
      copyReqHeaders?.props.onPress?.();
    });

    expect(Share.share).toHaveBeenCalledTimes(1);
    const msg = Share.share.mock.calls[0][0].message as string;
    expect(msg).toContain('Authorization: [REDACTED]');
    expect(msg).not.toContain('── cURL ──'); // only the section, not the whole export
  });
});
