// Mock react-native primitives + Appearance.
jest.mock('react-native', () => {
  const React = jest.requireActual('react');
  let scheme: 'light' | 'dark' | null = 'light';
  const listeners = new Set<(ev: { colorScheme: 'light' | 'dark' | null }) => void>();
  return {
    Appearance: {
      getColorScheme: () => scheme,
      addChangeListener: (cb: (ev: { colorScheme: 'light' | 'dark' | null }) => void) => {
        listeners.add(cb);
        return { remove: () => listeners.delete(cb) };
      },
      // Test hooks
      __setScheme: (next: 'light' | 'dark' | null) => {
        scheme = next;
        listeners.forEach(l => l({ colorScheme: next }));
      },
      __resetListeners: () => {
        listeners.clear();
      },
    },
    View: function View(props: { children?: React.ReactNode }) {
      return React.createElement('View', props, props.children);
    },
  };
});

import React from 'react';
import { Appearance } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { ThemeProvider, useThemeMode } from '../../../src/panel/theme/ThemeProvider';
import { useTheme } from '../../../src/panel/theme/useTheme';
import { darkTokens, lightTokens } from '../../../src/panel/theme/tokens';

interface AppearanceTestHooks {
  __setScheme: (s: 'light' | 'dark' | null) => void;
  __resetListeners: () => void;
}
const A = Appearance as unknown as AppearanceTestHooks;

function Probe({ onTheme }: { onTheme: (mode: string, accent: string) => void }) {
  const t = useTheme();
  onTheme(t.mode, t.colors.accent);
  return null;
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    A.__resetListeners();
    A.__setScheme('light');
  });

  it('resolves to light tokens when mode is "light"', () => {
    const seen: Array<{ mode: string; accent: string }> = [];
    const tree = renderer.create(
      <ThemeProvider mode="light">
        <Probe onTheme={(mode, accent) => seen.push({ mode, accent })} />
      </ThemeProvider>
    );
    expect(seen[seen.length - 1]).toEqual({ mode: 'light', accent: lightTokens.colors.accent });
    tree.unmount();
  });

  it('resolves to dark tokens when mode is "dark"', () => {
    const seen: Array<{ mode: string; accent: string }> = [];
    const tree = renderer.create(
      <ThemeProvider mode="dark">
        <Probe onTheme={(mode, accent) => seen.push({ mode, accent })} />
      </ThemeProvider>
    );
    expect(seen[seen.length - 1]).toEqual({ mode: 'dark', accent: darkTokens.colors.accent });
    tree.unmount();
  });

  it('follows system mode by default', () => {
    A.__setScheme('dark');
    const seen: Array<{ mode: string }> = [];
    const tree = renderer.create(
      <ThemeProvider>
        <Probe onTheme={mode => seen.push({ mode })} />
      </ThemeProvider>
    );
    expect(seen[seen.length - 1]).toEqual({ mode: 'dark' });
    tree.unmount();
  });

  it('reacts to OS scheme changes when mode is "system"', () => {
    const seen: Array<string> = [];
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ThemeProvider mode="system">
          <Probe onTheme={mode => seen.push(mode)} />
        </ThemeProvider>
      );
    });
    expect(seen[seen.length - 1]).toBe('light');
    act(() => {
      A.__setScheme('dark');
    });
    expect(seen[seen.length - 1]).toBe('dark');
    tree.unmount();
  });

  it('does NOT react to OS changes when mode is pinned', () => {
    const seen: Array<string> = [];
    const tree = renderer.create(
      <ThemeProvider mode="light">
        <Probe onTheme={mode => seen.push(mode)} />
      </ThemeProvider>
    );
    const before = seen.length;
    act(() => {
      A.__setScheme('dark');
    });
    expect(seen.length).toBe(before); // no re-render
    tree.unmount();
  });

  it('merges partial theme overrides over the base', () => {
    const seen: Array<{ accent: string }> = [];
    const tree = renderer.create(
      <ThemeProvider mode="light" theme={{ colors: { accent: '#abcdef' } }}>
        <Probe onTheme={(_, accent) => seen.push({ accent })} />
      </ThemeProvider>
    );
    expect(seen[seen.length - 1]).toEqual({ accent: '#abcdef' });
    tree.unmount();
  });

  it('falls back to light tokens when no provider is mounted', () => {
    const seen: Array<{ mode: string; accent: string }> = [];
    const tree = renderer.create(<Probe onTheme={(mode, accent) => seen.push({ mode, accent })} />);
    expect(seen[seen.length - 1]).toEqual({ mode: 'light', accent: lightTokens.colors.accent });
    tree.unmount();
  });

  it('switches mode at runtime via useThemeMode().setMode', () => {
    const seen: string[] = [];
    let setMode: ((m: 'light' | 'dark' | 'system') => void) | null = null;
    function ModeProbe() {
      const { mode, setMode: set } = useThemeMode();
      setMode = set;
      seen.push(mode);
      return null;
    }
    let tree!: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ThemeProvider mode="light">
          <ModeProbe />
        </ThemeProvider>
      );
    });
    expect(seen[seen.length - 1]).toBe('light'); // seeded from the prop
    act(() => setMode!('dark'));
    expect(seen[seen.length - 1]).toBe('dark'); // runtime switch took effect
    tree.unmount();
  });

  describe('density', () => {
    function ControlProbe({ onControl }: { onControl: (lg: number, slop: number) => void }) {
      const t = useTheme();
      onControl(t.control.lg, t.hitSlop.loose);
      return null;
    }

    it('comfortable density keeps the 44pt touch floor (default)', () => {
      let lg = 0;
      const tree = renderer.create(
        <ThemeProvider mode="light">
          <ControlProbe onControl={c => (lg = c)} />
        </ThemeProvider>
      );
      expect(lg).toBe(44);
      tree.unmount();
    });

    it('compact density shrinks control + hitSlop tokens', () => {
      let lg = 0;
      let slop = 0;
      const tree = renderer.create(
        <ThemeProvider mode="light" density="compact">
          <ControlProbe
            onControl={(c, s) => {
              lg = c;
              slop = s;
            }}
          />
        </ThemeProvider>
      );
      expect(lg).toBeLessThan(44);
      expect(lg).toBe(Math.round(44 * 0.88)); // 39
      expect(slop).toBeLessThan(14);
      tree.unmount();
    });

    it('a consumer theme override still wins over density scaling', () => {
      let lg = 0;
      const tree = renderer.create(
        <ThemeProvider mode="light" density="compact" theme={{ control: { lg: 60 } }}>
          <ControlProbe onControl={c => (lg = c)} />
        </ThemeProvider>
      );
      expect(lg).toBe(60); // explicit token beats the density factor
      tree.unmount();
    });
  });

  describe('fonts + preset (Phase 5 overrides)', () => {
    function FontProbe({ onFonts }: { onFonts: (sans: string | undefined, mono: string) => void }) {
      const t = useTheme();
      onFonts(t.typography.sans, t.typography.mono);
      return null;
    }
    function SurfaceProbe({ onSurface }: { onSurface: (s: string) => void }) {
      const t = useTheme();
      onSurface(t.colors.surface);
      return null;
    }

    it('injects custom font families', () => {
      let sans: string | undefined;
      let mono = '';
      const tree = renderer.create(
        <ThemeProvider mode="light" fonts={{ sans: 'Inter', mono: 'JetBrains Mono' }}>
          <FontProbe
            onFonts={(s, m) => {
              sans = s;
              mono = m;
            }}
          />
        </ThemeProvider>
      );
      expect(sans).toBe('Inter');
      expect(mono).toBe('JetBrains Mono');
      tree.unmount();
    });

    it('defaults sans to undefined (system font) and mono to Menlo', () => {
      let sans: string | undefined = 'x';
      let mono = '';
      const tree = renderer.create(
        <ThemeProvider mode="light">
          <FontProbe
            onFonts={(s, m) => {
              sans = s;
              mono = m;
            }}
          />
        </ThemeProvider>
      );
      expect(sans).toBeUndefined();
      expect(mono).toBe('Menlo');
      tree.unmount();
    });

    it('applies a named preset as sugar over the base', () => {
      let surface = '';
      const tree = renderer.create(
        <ThemeProvider mode="light" preset="paper">
          <SurfaceProbe onSurface={s => (surface = s)} />
        </ThemeProvider>
      );
      expect(surface).toBe('#fbfaf7'); // paper surface
      tree.unmount();
    });

    it('lets an explicit theme slot win over the preset', () => {
      let surface = '';
      const tree = renderer.create(
        <ThemeProvider mode="light" preset="paper" theme={{ colors: { surface: '#123456' } }}>
          <SurfaceProbe onSurface={s => (surface = s)} />
        </ThemeProvider>
      );
      expect(surface).toBe('#123456'); // theme beats preset
      tree.unmount();
    });
  });
});
