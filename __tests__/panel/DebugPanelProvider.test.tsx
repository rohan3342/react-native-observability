/**
 * `react-native`'s index.js uses Flow syntax that ts-jest can't parse without
 * the RN Babel preset wired in. The panel tests only need a structural stub
 * — every RN component is rendered as a passthrough so the React tree
 * mounts and the context's state transitions can be asserted. Real RN
 * rendering is verified by hand in the example app, not in unit tests.
 */
jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  const passthrough = (name: string) =>
    function Stub(props: { children?: React.ReactNode }) {
      return React.createElement(name, props, props.children);
    };
  return {
    Modal: passthrough('Modal'),
    View: passthrough('View'),
    Text: passthrough('Text'),
    Pressable: passthrough('Pressable'),
    ScrollView: passthrough('ScrollView'),
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios ?? o.default },
    StatusBar: { currentHeight: 24 },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(s: T) => s,
      hairlineWidth: 1,
      absoluteFillObject: {},
    },
    Animated: {
      Value: class {
        constructor(public v: number) {}
        setValue() {}
        interpolate() {
          return this;
        }
      },
      View: passthrough('Animated.View'),
      spring: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
      parallel: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
      timing: () => ({
        start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
        stop: () => undefined,
      }),
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined }),
      setAccessibilityFocus: () => undefined,
    },
    BackHandler: { addEventListener: () => ({ remove: () => undefined }) },
    findNodeHandle: () => 1,
  };
});

import React, { useEffect } from 'react';
import renderer, { act } from 'react-test-renderer';
import { DebugPanelProvider } from '../../src/panel/DebugPanelProvider';
import { useDebugPanel } from '../../src/panel/useDebugPanel';
import type { DebugPanelContextValue, DebugPanelTab } from '../../src/panel/types';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

/** Captures the latest context value via the hook so tests can assert on it. */
function Probe({ onContext }: { onContext(ctx: DebugPanelContextValue): void }): null {
  const ctx = useDebugPanel();
  useEffect(() => {
    onContext(ctx);
  });
  return null;
}

function mount(props: React.ComponentProps<typeof DebugPanelProvider>): {
  rendered: renderer.ReactTestRenderer;
  latest: () => DebugPanelContextValue;
} {
  let lastCtx: DebugPanelContextValue | null = null;
  let rendered: renderer.ReactTestRenderer | null = null;
  act(() => {
    rendered = renderer.create(
      <DebugPanelProvider {...props}>
        <Probe
          onContext={c => {
            lastCtx = c;
          }}
        />
      </DebugPanelProvider>
    );
  });
  return {
    rendered: rendered!,
    latest: () => lastCtx!,
  };
}

describe('DebugPanelProvider — defaults', () => {
  it('exposes the default tab set when none is supplied', () => {
    const { latest } = mount({ children: null });
    expect(latest().tabs).toEqual(['logs', 'network', 'state', 'navigation', 'settings']);
  });

  it('starts closed', () => {
    const { latest } = mount({ children: null });
    expect(latest().isOpen).toBe(false);
  });

  it('activeTab defaults to the first configured tab', () => {
    const { latest } = mount({ children: null });
    expect(latest().activeTab).toBe('logs');
  });

  it('selectedSessionId starts undefined', () => {
    const { latest } = mount({ children: null });
    expect(latest().selectedSessionId).toBeUndefined();
  });
});

function textOf(tree: renderer.ReactTestRenderer): string {
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

describe('DebugPanelProvider — branding', () => {
  it('renders the default Observability wordmark when no branding is given', () => {
    const { latest, rendered } = mount({ enabled: true, children: null });
    act(() => latest().openPanel());
    expect(textOf(rendered)).toContain('🩺 Observability');
  });

  it('renders a custom title, logo, and subtitle', () => {
    const { latest, rendered } = mount({
      enabled: true,
      branding: { title: 'Acme Debug', logo: '🐝', subtitle: 'staging' },
      children: null,
    });
    act(() => latest().openPanel());
    const text = textOf(rendered);
    expect(text).toContain('🐝 Acme Debug');
    expect(text).toContain('staging');
  });

  it('exposes branding on the context', () => {
    const { latest } = mount({ branding: { title: 'X' }, children: null });
    expect(latest().branding?.title).toBe('X');
  });
});

describe('DebugPanelProvider — openPanel / closePanel', () => {
  it('openPanel() opens the panel', () => {
    const { latest } = mount({ children: null });
    act(() => {
      latest().openPanel();
    });
    expect(latest().isOpen).toBe(true);
  });

  it('openPanel("network") opens and sets the active tab', () => {
    const { latest } = mount({ children: null });
    act(() => {
      latest().openPanel('network');
    });
    expect(latest().isOpen).toBe(true);
    expect(latest().activeTab).toBe('network');
  });

  it('openPanel ignores an unknown tab and falls back to the first', () => {
    const { latest } = mount({ children: null, tabs: ['logs', 'settings'] });
    act(() => {
      latest().openPanel('navigation' as DebugPanelTab);
    });
    expect(latest().isOpen).toBe(true);
    expect(latest().activeTab).toBe('logs');
  });

  it('closePanel() closes and resets selectedSessionId', () => {
    const { latest } = mount({ children: null });
    act(() => {
      latest().openPanel();
      latest().setSelectedSessionId('s-1');
    });
    expect(latest().selectedSessionId).toBe('s-1');

    act(() => {
      latest().closePanel();
    });
    expect(latest().isOpen).toBe(false);
    expect(latest().selectedSessionId).toBeUndefined();
  });
});

describe('DebugPanelProvider — panelComponent override', () => {
  it('renders the custom panelComponent instead of the built-in panel when open', () => {
    const CustomPanel = jest.fn(() => null);
    const { latest } = mount({ children: null, panelComponent: CustomPanel });

    // Not rendered until the panel is open.
    expect(CustomPanel).not.toHaveBeenCalled();

    act(() => {
      latest().openPanel();
    });

    expect(CustomPanel).toHaveBeenCalled();
  });

  it('does not render the custom panelComponent while closed', () => {
    const CustomPanel = jest.fn(() => null);
    mount({ children: null, panelComponent: CustomPanel });
    expect(CustomPanel).not.toHaveBeenCalled();
  });
});

describe('DebugPanelProvider — enabled=false', () => {
  it('does not open when openPanel is called', () => {
    const { latest } = mount({ children: null, enabled: false });
    act(() => {
      latest().openPanel('logs');
    });
    expect(latest().isOpen).toBe(false);
  });
});

describe('DebugPanelProvider — custom tabs', () => {
  it('honours the supplied tab set + ordering', () => {
    const { latest } = mount({ children: null, tabs: ['settings', 'logs'] });
    expect(latest().tabs).toEqual(['settings', 'logs']);
    expect(latest().activeTab).toBe('settings');
  });

  it('initialTab is used when in the configured set', () => {
    const { latest } = mount({
      children: null,
      tabs: ['logs', 'settings'],
      initialTab: 'settings',
    });
    expect(latest().activeTab).toBe('settings');
  });

  it('initialTab is ignored when not in the configured set', () => {
    const { latest } = mount({
      children: null,
      tabs: ['logs', 'settings'],
      initialTab: 'network' as DebugPanelTab,
    });
    expect(latest().activeTab).toBe('logs');
  });

  it('setActiveTab refuses unknown tabs', () => {
    const { latest } = mount({ children: null, tabs: ['logs', 'settings'] });
    act(() => {
      latest().setActiveTab('network' as DebugPanelTab);
    });
    expect(latest().activeTab).toBe('logs');
  });
});

describe('useDebugPanel — outside provider', () => {
  it('throws a clear error', () => {
    expect(() => {
      renderer.create(
        <Probe
          onContext={() => {
            /* never reached */
          }}
        />
      );
    }).toThrow(/DebugPanelProvider/);
  });
});
