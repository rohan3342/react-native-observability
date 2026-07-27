import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as RN from 'react-native';
import { usePersistentState } from '../PanelPrefs';
import { deepMerge } from './deepMerge';
import { darkTokens, lightTokens, themePresets } from './tokens';
import type { PartialTheme, Theme } from './tokens';

/**
 * `Appearance` is read defensively. Some RN test mocks (and very old RN
 * versions) omit it; the panel must still render in those environments
 * — it just won't react to OS color-scheme changes.
 */
interface AppearanceLike {
  getColorScheme(): 'light' | 'dark' | null | undefined;
  addChangeListener(cb: (ev: { colorScheme: 'light' | 'dark' | null | undefined }) => void): {
    remove(): void;
  };
}
const Appearance: AppearanceLike | undefined = (RN as { Appearance?: AppearanceLike }).Appearance;

/**
 * Resolved theme distributed to every panel component.
 *
 * Consumers do not read this context directly — they call {@link useTheme}.
 *
 * @internal
 */
export const ThemeContext = createContext<Theme>(lightTokens);

/**
 * Color-scheme selection passed by the consumer.
 *
 * - `'light'` / `'dark'` pin the panel to that scheme regardless of OS.
 * - `'system'` follows {@link Appearance.getColorScheme} and reacts to
 *   live OS-level changes.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Distributes the current {@link ThemeMode} and a setter so the panel UI (e.g.
 * the Settings tab) can switch light/dark/system at runtime. The `mode` prop
 * seeds it; changes via `setMode` re-resolve the theme live.
 *
 * @internal — read via {@link useThemeMode}.
 */
export const ThemeModeContext = createContext<{
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}>({ mode: 'system', setMode: () => undefined });

/** Returns the current panel theme mode + a runtime setter. */
export function useThemeMode(): { mode: ThemeMode; setMode: (mode: ThemeMode) => void } {
  return useContext(ThemeModeContext);
}

/**
 * Interface density. `'comfortable'` (default) sizes interactive controls to the
 * 44pt touch minimum; `'compact'` shrinks control heights + hitSlop ~12% for
 * power users who want the old devtools density on a phone. It scales only the
 * sizing tokens (`control`, `hitSlop`), never colours or type.
 */
export type ThemeDensity = 'comfortable' | 'compact';

export interface ThemeProviderProps {
  /** Color-scheme selection. Default: `'system'`. */
  readonly mode?: ThemeMode;
  /**
   * Partial token overrides deep-merged over the active default. Only the
   * fields you set are replaced; everything else falls back to the built-in
   * light or dark palette.
   */
  readonly theme?: PartialTheme | undefined;
  /**
   * A named preset (`midnight` / `paper` / `highContrast`) — sugar over `theme`.
   * It's merged onto the base **before** `theme`, so an explicit `theme` slot
   * still wins. Pair surface-changing presets with a matching `mode`.
   */
  readonly preset?: keyof typeof themePresets;
  /** Interface density. Default: `'comfortable'`. */
  readonly density?: ThemeDensity;
  /**
   * Custom font families (the inject pattern — no bundled font dependency).
   * `sans` applies to all UI text; `mono` to data (JSON, URLs, level tags). Each
   * is optional; an omitted family keeps the default (system sans / `Menlo`).
   */
  readonly fonts?: { readonly sans?: string; readonly mono?: string };
  readonly children: React.ReactNode;
}

/** Apply injected font families over the resolved typography. */
function applyFonts(base: Theme, fonts: ThemeProviderProps['fonts']): Theme {
  if (fonts === undefined || (fonts.sans === undefined && fonts.mono === undefined)) return base;
  return {
    ...base,
    typography: {
      ...base.typography,
      ...(fonts.sans !== undefined ? { sans: fonts.sans } : {}),
      ...(fonts.mono !== undefined ? { mono: fonts.mono } : {}),
    },
  };
}

/** Scale the sizing tokens for `'compact'` density (no-op for comfortable). */
function applyDensity(base: Theme, density: ThemeDensity): Theme {
  if (density !== 'compact') return base;
  const f = 0.88;
  const round = (n: number): number => Math.round(n);
  return {
    ...base,
    control: {
      sm: round(base.control.sm * f),
      md: round(base.control.md * f),
      lg: round(base.control.lg * f),
    },
    hitSlop: {
      tight: round(base.hitSlop.tight * f),
      default: round(base.hitSlop.default * f),
      loose: round(base.hitSlop.loose * f),
    },
  };
}

/**
 * Provides the resolved {@link Theme} to every descendant panel component.
 *
 * Wraps the panel subtree inside `DebugPanelProvider`; you do not normally
 * mount this directly. The provider listens to OS color-scheme changes
 * when `mode === 'system'` and re-emits when the resolution changes.
 *
 * Token resolution order:
 *  1. Pick `lightTokens` or `darkTokens` based on `mode`.
 *  2. Deep-merge the consumer's `theme` override onto that base.
 *  3. Memoise so identity is stable across renders.
 */
export function ThemeProvider({
  mode: initialMode = 'system',
  theme,
  preset,
  density = 'comfortable',
  fonts,
  children,
}: ThemeProviderProps): React.ReactElement {
  // Mode is runtime-switchable (Settings → Appearance) and persisted, seeded
  // from the `mode` prop. The prop is the default; once the user picks a mode it
  // sticks (and survives restarts when a `persist` adapter is configured).
  const [mode, setMode] = usePersistentState<ThemeMode>('theme.mode', initialMode);

  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(() =>
    Appearance?.getColorScheme() === 'dark' ? 'dark' : 'light'
  );

  useEffect(() => {
    if (mode !== 'system' || Appearance === undefined) return undefined;
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light');
    });
    return () => sub.remove();
  }, [mode]);

  const resolved: Theme = useMemo(() => {
    const scheme = mode === 'system' ? systemScheme : mode;
    const base = scheme === 'dark' ? darkTokens : lightTokens;
    // Resolution order: density-scaled base → preset → consumer `theme` → fonts.
    // The preset is sugar merged before `theme`, so an explicit theme slot wins;
    // fonts are applied last so an injected family always wins.
    const withDensity = applyDensity(base, density);
    const withPreset =
      preset !== undefined ? deepMerge(withDensity, themePresets[preset]) : withDensity;
    return applyFonts(deepMerge(withPreset, theme), fonts);
    // Deps use the font fields (not the object identity) so an inline `fonts={{…}}`
    // doesn't rebuild the theme every render.
  }, [mode, systemScheme, theme, preset, density, fonts?.sans, fonts?.mono]);

  const modeApi = useMemo(() => ({ mode, setMode }), [mode, setMode]);

  return (
    <ThemeModeContext.Provider value={modeApi}>
      <ThemeContext.Provider value={resolved}>{children}</ThemeContext.Provider>
    </ThemeModeContext.Provider>
  );
}
