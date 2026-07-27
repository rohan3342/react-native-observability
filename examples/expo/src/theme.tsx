/**
 * Design tokens for the Expo example app's own chrome.
 *
 * Deliberately mirrors the vocabulary of the debug panel's tokens
 * (`react-native-observability/panel`) — same semantic colour slots, 4-point
 * spacing grid, radii, and type ramp — so the demo app and the panel it opens
 * read as one product. The example is light/dark aware via `useColorScheme()`;
 * the panel themes itself independently.
 *
 * Components read tokens through {@link useTheme} so a system theme switch
 * re-renders them. Nothing imports the palette objects directly.
 */

import { useColorScheme } from 'react-native';

/** Semantic colour slots — names describe purpose, not appearance. */
export interface Colors {
  /** App background. */
  bg: string;
  /** Card / raised surface. */
  surface: string;
  /** One step inward — inset wells, pressed rows. */
  surfaceSubtle: string;
  /** Hero / spotlight surface (high-contrast brand block). */
  spotlight: string;
  /** Text on the spotlight surface. */
  spotlightText: string;
  /** Muted text on the spotlight surface. */
  spotlightTextMuted: string;
  /** Primary text. */
  text: string;
  /** Secondary text — hints, metadata. */
  textMuted: string;
  /** Tertiary text. */
  textSubtle: string;
  /** Text/icon on an accent fill. */
  textInverse: string;
  /** Brand / interactive accent. */
  accent: string;
  /** Soft accent wash — ghost backgrounds, selected chips. */
  accentSoft: string;
  /** Hairlines, borders. */
  border: string;
  /** Status colours. */
  success: string;
  warning: string;
  danger: string;
  info: string;
}

/** A single icon-colour pairing used by buttons + section glyphs. */
export interface Theme {
  mode: 'light' | 'dark';
  colors: Colors;
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number };
  radii: { sm: number; md: number; lg: number; xl: number; pill: number };
  type: {
    caption: number;
    body: number;
    label: number;
    title: number;
    heading: number;
    display: number;
  };
  shadow: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
}

const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
const radii = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
const type = { caption: 12, body: 14, label: 13, title: 16, heading: 20, display: 26 } as const;

const light: Theme = {
  mode: 'light',
  spacing,
  radii,
  type,
  // Minimal: cards lean on the hairline border, not a drop shadow. Keep only a
  // whisper of depth so raised surfaces (sheets/fallback) still lift subtly.
  shadow: {
    shadowColor: '#0b1020',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  colors: {
    bg: '#f7f8fa',
    surface: '#ffffff',
    surfaceSubtle: '#f1f2f5',
    spotlight: '#14151b',
    spotlightText: '#ffffff',
    spotlightTextMuted: '#b9bdca',
    text: '#15161c',
    textMuted: '#5f636e',
    textSubtle: '#9498a3',
    textInverse: '#ffffff',
    accent: '#0a7aff',
    accentSoft: 'rgba(10,122,255,0.10)',
    border: '#e4e6ec',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    info: '#0ea5e9',
  },
};

const dark: Theme = {
  mode: 'dark',
  spacing,
  radii,
  type,
  shadow: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 2,
  },
  colors: {
    bg: '#0b0c10',
    surface: '#16171e',
    surfaceSubtle: '#1e1f27',
    spotlight: '#1c1e29',
    spotlightText: '#ffffff',
    spotlightTextMuted: '#a7adbd',
    text: '#f3f4f8',
    textMuted: '#a0a4b1',
    textSubtle: '#6c7180',
    textInverse: '#ffffff',
    accent: '#4c9bff',
    accentSoft: 'rgba(76,155,255,0.18)',
    border: '#2a2c36',
    success: '#34d399',
    warning: '#fbbf24',
    danger: '#f87171',
    info: '#38bdf8',
  },
};

/**
 * Resolve the active theme from the OS colour scheme. Falls back to light when
 * the scheme is `null` (unspecified).
 *
 * @returns the {@link Theme} matching the system appearance.
 */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
