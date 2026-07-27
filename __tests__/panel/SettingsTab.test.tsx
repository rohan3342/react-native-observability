jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SettingsTab } from '../../src/panel/tabs/SettingsTab';
import { DebugPanelContext } from '../../src/panel/DebugPanelProvider';
import { PanelPrefsProvider } from '../../src/panel/PanelPrefs';
import type { PanelPersistence } from '../../src/panel/PanelPrefs';
import { getPerfStore } from '../../src/integrations/perf';
import { getBreadcrumbStore, _resetBreadcrumbStore } from '../../src/integrations/breadcrumbs';
import { SliceRegistry } from '../../src/panel/SliceRegistry';
import { ObservabilityConfig, LogLevel, getInternalMetrics } from '../../src';
import {
  _resetMetrics,
  configurePanic,
  recordStorageFailure,
  incrTransportFailures,
} from '../../src/logger/internal/metrics';
import {
  initSessionManager,
  endCurrentSession,
  _resetSessionManager,
} from '../../src/storage/SessionManager';
import type { MMKVLike } from '../../src/storage/createStorage';
import type { LogSource, NetworkSource, ScreenSource } from '../../src/panel/types';
import type { DebugPanelContextValue } from '../../src/panel/types';

afterEach(() => {
  ObservabilityConfig.reset();
});

function buildLogSource(): LogSource & { clear: jest.Mock } {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => [
      {
        id: 'a',
        timestamp: 0,
        level: 1,
        namespace: 'app',
        message: 'hi',
      },
    ],
    clear: jest.fn(),
  };
}

function buildNetworkSource(): NetworkSource & { clear: jest.Mock } {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => [],
    clear: jest.fn(),
  };
}

function buildScreenSource(): ScreenSource & { clear: jest.Mock } {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => [],
    getSummaries: () => [],
    clear: jest.fn(),
  };
}

function withCtx(
  partial: Partial<DebugPanelContextValue>,
  ui: React.ReactElement
): React.ReactElement {
  const value: DebugPanelContextValue = {
    isOpen: true,
    openPanel: () => undefined,
    closePanel: jest.fn(),
    activeTab: 'settings',
    setActiveTab: () => undefined,
    tabs: ['settings'],
    selectedSessionId: undefined,
    setSelectedSessionId: () => undefined,
    logSource: null,
    networkSource: null,
    screenSource: null,
    registerStateSlice: () => () => undefined,
    stateSliceRegistry: new SliceRegistry(),
    ...partial,
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

/** Switch the Settings view via the top Segmented control ("Info" | "Health" | "Actions"). */
function tapView(tree: renderer.ReactTestRenderer, label: string): void {
  const btn = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);
  if (btn === undefined) throw new Error(`settings view "${label}" not found`);
  act(() => btn.props.onPress());
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

describe('SettingsTab — app info', () => {
  it('shows uninitialized hint when ObservabilityConfig.init() was never called', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    expect(stringTree(tree)).toMatch(/ObservabilityConfig not initialized/);
  });

  it('renders app name / version / build / build type when initialized', () => {
    ObservabilityConfig.init({
      app: {
        name: 'TestApp',
        version: '1.2.3',
        buildNumber: 42,
        buildType: 'staging',
      },
      logger: { namespace: 'app', level: LogLevel.DEBUG, transports: [] },
    });

    const tree = render(withCtx({}, <SettingsTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/TestApp/);
    expect(text).toMatch(/1\.2\.3/);
    expect(text).toMatch(/42/);
    expect(text).toMatch(/staging/);
  });
});

describe('SettingsTab — bulk actions', () => {
  it('Clear logs calls logSource.clear()', () => {
    const logSource = buildLogSource();
    const tree = render(withCtx({ logSource }, <SettingsTab />));
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === 'Clear logs');
    act(() => btn!.props.onPress());
    expect(logSource.clear).toHaveBeenCalledTimes(1);
  });

  it('Clear network history calls networkSource.clear()', () => {
    const networkSource = buildNetworkSource();
    const tree = render(withCtx({ networkSource }, <SettingsTab />));
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear network history'
    );
    act(() => btn!.props.onPress());
    expect(networkSource.clear).toHaveBeenCalledTimes(1);
  });

  it('Clear screen history calls screenSource.clear()', () => {
    const screenSource = buildScreenSource();
    const tree = render(withCtx({ screenSource }, <SettingsTab />));
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear screen history'
    );
    act(() => btn!.props.onPress());
    expect(screenSource.clear).toHaveBeenCalledTimes(1);
  });

  it('Close panel calls closePanel from context', () => {
    const closePanel = jest.fn();
    const tree = render(withCtx({ closePanel }, <SettingsTab />));
    const btn = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === 'Close panel');
    act(() => btn!.props.onPress());
    expect(closePanel).toHaveBeenCalledTimes(1);
  });

  it('Share all logs button is disabled when there are no logs', () => {
    const logSource: LogSource = {
      subscribe: () => () => undefined,
      getSnapshot: () => [],
    };
    const tree = render(withCtx({ logSource }, <SettingsTab />));
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Share all logs'
    );
    expect(btn!.props.accessibilityState).toEqual({ disabled: true });
  });

  it('Clear buttons are disabled when their sources are null', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Actions');
    const labels = ['Clear logs', 'Clear network history', 'Clear screen history'];
    for (const label of labels) {
      const btn = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);
      expect(btn!.props.accessibilityState).toEqual({ disabled: true });
    }
  });
});

describe('SettingsTab — granular clears (T5-4)', () => {
  function press(tree: renderer.ReactTestRenderer, label: string): void {
    const btn = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);
    expect(btn).toBeDefined();
    act(() => btn!.props.onPress());
  }

  it('Clear performance empties the perf store', () => {
    const spy = jest.spyOn(getPerfStore(), 'clear');
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Actions');
    press(tree, 'Clear performance');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('hides "Clear panel prefs" when no persistence is configured', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear panel prefs'
    );
    expect(btn).toBeUndefined();
  });

  it('hides "Clear panel prefs" when persistence has no clear()', () => {
    const persist: PanelPersistence = {
      getItem: () => null,
      setItem: () => undefined,
    };
    const tree = render(
      React.createElement(PanelPrefsProvider, { value: persist }, withCtx({}, <SettingsTab />))
    );
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear panel prefs'
    );
    expect(btn).toBeUndefined();
  });

  it('shows and wires "Clear panel prefs" when persistence supports clear()', () => {
    const clear = jest.fn();
    const persist: PanelPersistence = {
      getItem: () => null,
      setItem: () => undefined,
      clear,
    };
    const tree = render(
      React.createElement(PanelPrefsProvider, { value: persist }, withCtx({}, <SettingsTab />))
    );
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear panel prefs'
    );
    expect(btn).toBeDefined();
    act(() => btn!.props.onPress());
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('"Clear all" requires a confirm step before clearing everything', () => {
    const logSource = buildLogSource();
    const networkSource = buildNetworkSource();
    const screenSource = buildScreenSource();
    const perfClear = jest.spyOn(getPerfStore(), 'clear');
    const tree = render(withCtx({ logSource, networkSource, screenSource }, <SettingsTab />));
    tapView(tree, 'Actions');

    const findBtn = (label: string) =>
      findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);

    // First tap shows the confirm step; nothing cleared yet.
    act(() => findBtn('Clear all')!.props.onPress());
    expect(logSource.clear).not.toHaveBeenCalled();

    // Confirm clears every source + the perf store.
    expect(findBtn('Confirm clear all')).toBeDefined();
    act(() => findBtn('Confirm clear all')!.props.onPress());
    expect(logSource.clear).toHaveBeenCalledTimes(1);
    expect(networkSource.clear).toHaveBeenCalledTimes(1);
    expect(screenSource.clear).toHaveBeenCalledTimes(1);
    expect(perfClear).toHaveBeenCalled();
    perfClear.mockRestore();
  });

  it('shows "Clear persisted storage" only when onClearStorage is wired, and calls it', () => {
    const onClearStorage = jest.fn();
    const tree = render(withCtx({ onClearStorage }, <SettingsTab />));
    tapView(tree, 'Actions');
    const findBtn = (label: string) =>
      findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);

    const btn = findBtn('Clear persisted storage (MMKV)');
    expect(btn).toBeDefined();
    act(() => btn!.props.onPress());
    expect(onClearStorage).toHaveBeenCalledTimes(1);
  });

  it('hides "Clear persisted storage" when onClearStorage is not provided', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Actions');
    const btn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear persisted storage (MMKV)'
    );
    expect(btn).toBeUndefined();
  });

  it('"Clear all" also invokes onClearStorage when wired', () => {
    const onClearStorage = jest.fn();
    const tree = render(withCtx({ onClearStorage }, <SettingsTab />));
    tapView(tree, 'Actions');
    const findBtn = (label: string) =>
      findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);
    act(() => findBtn('Clear all')!.props.onPress());
    act(() => findBtn('Confirm clear all')!.props.onPress());
    expect(onClearStorage).toHaveBeenCalledTimes(1);
  });

  it('"Clear all" can be cancelled without clearing', () => {
    const logSource = buildLogSource();
    const tree = render(withCtx({ logSource }, <SettingsTab />));
    tapView(tree, 'Actions');
    const findBtn = (label: string) =>
      findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === label);
    act(() => findBtn('Clear all')!.props.onPress());
    act(() => findBtn('Cancel')!.props.onPress());
    expect(logSource.clear).not.toHaveBeenCalled();
    // Back to the single "Clear all" button.
    expect(findBtn('Clear all')).toBeDefined();
    expect(findBtn('Confirm clear all')).toBeUndefined();
  });
});

describe('SettingsTab — Appearance', () => {
  it('renders Light / Dark / System theme-mode chips', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    const text = stringTree(tree);
    expect(text).toContain('Appearance');
    expect(text).toContain('Light');
    expect(text).toContain('Dark');
    expect(text).toContain('System');
  });
});

describe('SettingsTab — view toggle (Info / Health / Actions)', () => {
  it('defaults to the Info view (App section, no Health metrics, no clears)', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    const text = stringTree(tree);
    expect(text).toContain('App');
    expect(text).toContain('Appearance');
    expect(text).not.toMatch(/Dropped \(total\)/); // Health view not shown
    const clear = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === 'Clear all');
    expect(clear).toBeUndefined(); // Actions view not shown
  });

  it('shows only the Health view (status + throughput, not Info)', () => {
    _resetMetrics();
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Health');
    const text = stringTree(tree);
    expect(text).toMatch(/HEALTHY/);
    expect(text).toMatch(/Throughput/);
    expect(text).not.toContain('Appearance'); // Info view hidden
  });

  it('shows the clear/export actions only in the Actions view', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Actions');
    const clear = findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === 'Clear all');
    expect(clear).toBeDefined();
    expect(stringTree(tree)).not.toContain('Appearance'); // Info view hidden
  });

  it('keeps "Close panel" available in every view', () => {
    const tree = render(withCtx({}, <SettingsTab />));
    const close = () =>
      findAll(tree, 'Pressable').find(p => p.props.accessibilityLabel === 'Close panel');
    expect(close()).toBeDefined(); // Info
    tapView(tree, 'Health');
    expect(close()).toBeDefined();
    tapView(tree, 'Actions');
    expect(close()).toBeDefined();
  });
});

describe('SettingsTab — Health (internal metrics)', () => {
  afterEach(() => {
    _resetMetrics();
  });

  it('shows HEALTHY with no problems when metrics are clean', () => {
    _resetMetrics();
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Health');
    const text = stringTree(tree);
    expect(text).toMatch(/HEALTHY/);
    expect(text).toMatch(/No drops or failures/);
    expect(text).toMatch(/Throughput/);
    // No problem rows when clean.
    expect(text).not.toMatch(/Transport failures/);
  });

  it('shows DEGRADED and a problem row when a failure occurs', () => {
    _resetMetrics();
    incrTransportFailures(); // a real failure, not an expected drop

    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Health');
    const text = stringTree(tree);
    expect(text).toMatch(/DEGRADED/);
    expect(text).toMatch(/Transport failures/);
    expect(text).not.toMatch(/HEALTHY/);
  });

  it('shows PANIC + a Clear panic button when panic is active, and clears it', () => {
    _resetMetrics();
    configurePanic({ storageFailTrip: 1 });
    recordStorageFailure(); // trips panic

    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Health');
    expect(stringTree(tree)).toMatch(/PANIC/);

    const clearBtn = findAll(tree, 'Pressable').find(
      p => p.props.accessibilityLabel === 'Clear panic (resume delivery)'
    );
    expect(clearBtn).toBeDefined();

    act(() => clearBtn!.props.onPress());
    // After clearing, the verdict returns to HEALTHY.
    expect(stringTree(tree)).toMatch(/HEALTHY/);
    expect(getInternalMetrics().panic.tripped).toBe(false);
  });
});

class FakeMMKV implements MMKVLike {
  readonly data = new Map<string, string | number | boolean>();
  set(k: string, v: string | number | boolean): void {
    this.data.set(k, v);
  }
  getString(k: string): string | undefined {
    const v = this.data.get(k);
    return typeof v === 'string' ? v : undefined;
  }
  getNumber(k: string): number | undefined {
    const v = this.data.get(k);
    return typeof v === 'number' ? v : undefined;
  }
  getBoolean(k: string): boolean | undefined {
    const v = this.data.get(k);
    return typeof v === 'boolean' ? v : undefined;
  }
  contains(k: string): boolean {
    return this.data.has(k);
  }
  delete(k: string): void {
    this.data.delete(k);
  }
  getAllKeys(): string[] {
    return [...this.data.keys()];
  }
}

const noopAppState = { addEventListener: () => ({ remove: () => undefined }) };

describe('SettingsTab — Session health (T5-5)', () => {
  afterEach(() => {
    _resetSessionManager();
  });

  it('does not render the Session health section when SessionManager is uninitialised', () => {
    _resetSessionManager();
    const tree = render(withCtx({}, <SettingsTab />));
    expect(stringTree(tree)).not.toMatch(/Session health/);
  });

  it('shows a crash-free status for a single live session', () => {
    const mmkv = new FakeMMKV();
    initSessionManager(mmkv, { appVersion: '1.0.0', buildNumber: 1, appState: noopAppState });

    const tree = render(withCtx({}, <SettingsTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/Session health/);
    expect(text).toMatch(/✓ crash-free/);
    expect(text).toMatch(/Sessions tracked\s+1/);
    expect(text).toMatch(/● live/);
  });

  it('flags a crashed prior session and counts it', () => {
    const mmkv = new FakeMMKV();
    // First launch: session A starts but never ends (simulated crash).
    initSessionManager(mmkv, { appVersion: '1.0.0', buildNumber: 1, appState: noopAppState });
    _resetSessionManager();
    // Second launch on the same store: A has no endTime → marked crashed; B is live.
    initSessionManager(mmkv, { appVersion: '1.0.0', buildNumber: 1, appState: noopAppState });

    const tree = render(withCtx({}, <SettingsTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/⚠ 1 crashed/);
    expect(text).toMatch(/Sessions tracked\s+2/);
    expect(text).toMatch(/⚠ crashed/);
    expect(text).toMatch(/● live/);
  });

  it('marks a cleanly-ended prior session as clean, not crashed', () => {
    const mmkv = new FakeMMKV();
    initSessionManager(mmkv, { appVersion: '1.0.0', buildNumber: 1, appState: noopAppState });
    endCurrentSession(); // A ends cleanly
    _resetSessionManager();
    initSessionManager(mmkv, { appVersion: '1.0.0', buildNumber: 1, appState: noopAppState });

    const tree = render(withCtx({}, <SettingsTab />));
    const text = stringTree(tree);
    expect(text).toMatch(/✓ crash-free/);
    expect(text).toMatch(/✓ clean/);
    expect(text).not.toMatch(/⚠ crashed/);
  });
});

describe('SettingsTab — Timeline (T5-6)', () => {
  afterEach(() => {
    _resetBreadcrumbStore();
  });

  it('shows an empty hint when there are no breadcrumbs', () => {
    _resetBreadcrumbStore();
    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Timeline');
    expect(stringTree(tree)).toMatch(/No breadcrumbs yet/);
  });

  it('renders recorded breadcrumbs newest-first in the live stream', () => {
    _resetBreadcrumbStore();
    const store = getBreadcrumbStore();
    store.record({ timestamp: 1000, kind: 'log', level: 'info', message: 'first crumb' });
    store.record({ timestamp: 2000, kind: 'network', level: 'info', message: 'GET /x → 200' });

    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Timeline');
    const text = stringTree(tree);
    expect(text).toMatch(/first crumb/);
    expect(text).toMatch(/GET \/x → 200/);
    expect(text).toMatch(/Live/);
  });

  it('surfaces a crash trail from a prior crashed session', () => {
    _resetBreadcrumbStore();
    _resetSessionManager();
    const mmkv = new FakeMMKV();
    const persist = {
      getItem: (k: string) => (mmkv.getString(k) ?? null) as string | null,
      setItem: (k: string, v: string) => mmkv.set(k, v),
      removeItem: (k: string) => mmkv.delete(k),
    };

    // Prior session records a trail, then "crashes" (no endTime), then a new
    // launch marks it crashed and the panel surfaces its trail.
    initSessionManager(mmkv, { appVersion: '1', buildNumber: 1, appState: noopAppState });
    const prior = getCurrentSessionIdForTest();
    const store = getBreadcrumbStore();
    store.configurePersistence(persist, prior);
    store.record({ timestamp: 1000, kind: 'log', level: 'error', message: 'about to crash' });

    _resetSessionManager();
    _resetBreadcrumbStore();
    initSessionManager(mmkv, { appVersion: '1', buildNumber: 1, appState: noopAppState });
    getBreadcrumbStore().configurePersistence(persist, 'whatever-current');

    const tree = render(withCtx({}, <SettingsTab />));
    tapView(tree, 'Timeline');
    const text = stringTree(tree);
    expect(text).toMatch(/Crash trail/);
    expect(text).toMatch(/about to crash/);
  });
});

function getCurrentSessionIdForTest(): string {
  // SessionManager's getCurrentSessionId is re-exported through the barrel used
  // above; read it via require to avoid another top import.
  const { getCurrentSessionId } =
    require('../../src/storage/SessionManager') as typeof import('../../src/storage/SessionManager');
  return getCurrentSessionId() ?? '';
}
