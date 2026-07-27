/**
 * Panel theme barrel — tokens, provider, hook, primitives.
 *
 * Internal to `src/panel`. Public re-exports live in `src/panel/index.ts`.
 */
export { ThemeProvider, ThemeContext, useThemeMode } from './ThemeProvider';
export type { ThemeMode, ThemeDensity, ThemeProviderProps } from './ThemeProvider';
export { useTheme } from './useTheme';
export { lightTokens, darkTokens, themePresets } from './tokens';
export type {
  Theme,
  ThemeColors,
  ThemeSpacing,
  ThemeRadii,
  ThemeTypography,
  ThemeShadow,
  PartialTheme,
} from './tokens';
export { deepMerge } from './deepMerge';
export { Surface, TextX, Button, Pill, Hairline, Spacer, isFocused } from './primitives';
export type { SurfaceProps, TextXProps, ButtonProps, PillProps } from './primitives';
