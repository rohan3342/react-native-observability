/**
 * Design tokens for the on-device debug panel.
 *
 * Single source of truth for every color, dimension, radius, font size,
 * and shadow used in panel chrome and tab bodies. Two complete sets are
 * exported — `lightTokens` and `darkTokens` — and a {@link Theme} type that
 * structurally types both.
 *
 * A consumer's `theme` prop on `DebugPanelProvider` is deep-merged over
 * whichever default set matches the resolved color scheme. Tokens are
 * read at render time by {@link useTheme}; components do not import this
 * file directly — they go through the hook so theme switches re-render.
 */

/**
 * Semantic color slots. Names describe *purpose*, not appearance:
 * `surface` is the panel background; `surfaceSubtle` is a one-step-inward
 * surface (search input, settings card); `surfaceRaised` sits above both
 * for floating chrome (detail sheets). Keep this list small — every slot
 * is a public-API commitment.
 */
export interface ThemeColors {
  /** Outermost panel background. */
  readonly surface: string;
  /** One step inward — search input, filter chip background. */
  readonly surfaceSubtle: string;
  /** Two steps inward — pressed states, hairlines. */
  readonly surfaceMuted: string;
  /** Floating layer — detail sheet background. */
  readonly surfaceRaised: string;
  /** Top toolbar (header + tab bar) background. Devtool-style: contrasts
   *  hard with `surface` so the chrome reads as a separate UI layer. */
  readonly chromeBg: string;
  /** Embedded controls inside the chrome (close button, header chips). */
  readonly chromeBgRaised: string;
  /** Text/icon color on top of `chromeBg`. */
  readonly chromeText: string;
  /** Muted text on top of `chromeBg`. */
  readonly chromeTextMuted: string;
  /** Primary text on `surface`. */
  readonly text: string;
  /** Secondary text — metadata, hints. */
  readonly textMuted: string;
  /** Disabled / tertiary text — placeholders. */
  readonly textSubtle: string;
  /** Inverse text on accent backgrounds — button labels. */
  readonly textInverse: string;
  /** Brand / interactive accent — buttons, active states. */
  readonly accent: string;
  /** Pressed-state overlay on accent. */
  readonly accentPressed: string;
  /** Soft accent wash — tinted background for selected rows / active chips. */
  readonly accentSoft: string;
  /** Row press / hover wash — one tone above `surface`, below `surfaceSubtle`. */
  readonly surfaceHover: string;
  /** 1px borders, hairlines. */
  readonly border: string;
  /** Stronger border for emphasised containers. */
  readonly borderStrong: string;
  /** Keyboard / assistive-tech focus outline. */
  readonly focusRing: string;
  /** Skeleton placeholder base fill. */
  readonly skeletonBase: string;
  /** Skeleton shimmer highlight. */
  readonly skeletonHighlight: string;
  /** Backdrop scrim behind modals. */
  readonly backdrop: string;
  /** Status: success / OK. */
  readonly success: string;
  /** Status: warn / caution. */
  readonly warning: string;
  /** Status: error / destructive. */
  readonly danger: string;
  /** Status: informational. */
  readonly info: string;
  /** Per-LogLevel accent — keys match `LogLevel` enum numeric values. */
  readonly logLevel: {
    readonly debug: string;
    readonly info: string;
    readonly warn: string;
    readonly error: string;
  };
  /** HTTP method tag backgrounds. */
  readonly method: {
    readonly get: string;
    readonly post: string;
    readonly put: string;
    readonly patch: string;
    readonly delete: string;
    readonly other: string;
  };
  /**
   * Soft tinted row backgrounds for at-a-glance status scanning — a faint wash
   * behind a log row / network row keyed by severity. Much lower contrast than
   * the solid `logLevel` / status colours (used for text), so rows stay legible.
   */
  readonly tint: {
    readonly debug: string;
    readonly info: string;
    readonly warn: string;
    readonly error: string;
    readonly success: string;
  };
}

/**
 * Spacing scale in logical pixels. 4-point grid: every layout offset in
 * the panel should resolve to one of these values.
 */
export interface ThemeSpacing {
  readonly xs: number; // 2
  readonly sm: number; // 4
  readonly md: number; // 8
  readonly lg: number; // 12
  readonly xl: number; // 16
  readonly xxl: number; // 24
  /**
   * @deprecated Fallback only. The panel now resolves real device safe-area
   * insets at runtime (`usePanelInsets`, preferring `react-native-safe-area-context`)
   * instead of this static value, so it's correct on Dynamic Island / landscape /
   * tablet / Android. Retained for type compatibility.
   */
  readonly safeTop: number;
}

/** Border radii. */
export interface ThemeRadii {
  readonly sm: number; // 4 — tight buttons
  readonly md: number; // 6 — tab pills, surfaces
  readonly lg: number; // 10 — cards, search input
  readonly pill: number; // 999 — fully rounded chips
}

/**
 * A single typographic step — size + weight, and an optional line-height.
 *
 * `lineHeight` (logical px) is applied by `TextX` when present so multi-line
 * text (log messages, JSON, breadcrumbs) keeps a comfortable 1.4–1.5 measure
 * instead of the platform default. Optional for back-compat: a step without it
 * renders exactly as before.
 */
type TypeStep = {
  readonly size: number;
  readonly weight: '400' | '500' | '600' | '700';
  readonly lineHeight?: number;
};

/** Typography ramp — sizes, weights, and the two font families. */
export interface ThemeTypography {
  readonly caption: TypeStep;
  readonly body: TypeStep;
  readonly label: TypeStep;
  readonly title: TypeStep;
  readonly heading: TypeStep;
  /** Largest step — the panel wordmark / branding title. */
  readonly display: TypeStep;
  /**
   * UI sans family for all non-mono text. `undefined` (default) uses the
   * platform system font. Override via `DebugPanelProvider.fonts.sans`.
   */
  readonly sans?: string;
  /** Monospaced family used for raw payloads + level tags. */
  readonly mono: string;
}

/**
 * Icon / glyph sizes in logical pixels. The panel uses Unicode glyphs as its
 * icon vocabulary (zero icon-font dependency); these tokens keep glyph + badge
 * sizing on a consistent scale instead of ad-hoc inline numbers.
 */
export interface ThemeIconSizes {
  readonly sm: number; // 14 — inline list-row glyphs
  readonly md: number; // 18 — header / section glyphs
  readonly lg: number; // 24 — empty-state / emphasis
}

/** Shadow / elevation. Used by raised surfaces only. */
export interface ThemeShadow {
  readonly shadowColor: string;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly elevation: number;
}

/**
 * Motion durations (ms) + named easing curves, so every animation in the panel
 * shares one rhythm instead of ad-hoc literals. `fast` is for micro-interactions
 * (press, chip toggle), `base` for sheets/overlays, `slow` for the largest
 * transitions. Exit animations should run at ~0.7× their enter duration.
 *
 * Easing strings are `cubic-bezier` definitions; consumers of `Animated.timing`
 * map them with `Easing.bezier(...)`. They are kept as data here so the token
 * layer stays free of a `react-native` import.
 */
export interface ThemeMotion {
  readonly duration: {
    readonly instant: number; // 0 — reduce-motion / no transition
    readonly fast: number; // 150 — press, toggle
    readonly base: number; // 220 — sheet/overlay enter
    readonly slow: number; // 320 — largest transitions
  };
  readonly easing: {
    /** Enter — standard decelerate. */
    readonly standard: readonly [number, number, number, number];
    /** Pure decelerate (incoming elements). */
    readonly decelerate: readonly [number, number, number, number];
    /** Accelerate (exiting elements). */
    readonly accelerate: readonly [number, number, number, number];
  };
}

/**
 * Stacking order for layered surfaces. Replaces the magic `9999` on the overlay
 * so a host that wraps the panel in its own positioned context stays predictable.
 */
export interface ThemeZIndex {
  readonly base: number; // 0
  readonly sticky: number; // 10 — sticky toolbars
  readonly overlay: number; // 1000 — the panel fill layer
  readonly sheet: number; // 1100 — bottom sheets above the panel
  readonly toast: number; // 1200 — toast above everything
}

/**
 * Named `hitSlop` insets (logical px) so small glyph buttons reach the ≥44pt
 * touch minimum without each call-site inventing its own number.
 */
export interface ThemeHitSlop {
  readonly tight: number; // 6
  readonly default: number; // 10
  readonly loose: number; // 14
}

/**
 * Interaction opacity values. Centralises the pressed/disabled washes that were
 * scattered as `0.7` / `0.6` / `0.4` literals across components.
 */
export interface ThemeOpacity {
  readonly pressed: number; // 0.7 — buttons, rows, close
  readonly pressedSubtle: number; // 0.6 — chips, segments, carets
  readonly disabled: number; // 0.4 — disabled controls
}

/**
 * Minimum interactive control heights (logical px). `lg` is the platform touch
 * minimum (44pt) — chips, segments, icon buttons, and switch rows use it as a
 * `minHeight` so taps always clear the accessibility floor. The values scale
 * with the provider's `density` setting (`'compact'` shrinks them ~12%).
 */
export interface ThemeControl {
  readonly sm: number; // small/inline controls
  readonly md: number; // default control row
  readonly lg: number; // ≥44 — touch minimum
}

/** Complete theme — the value returned by {@link useTheme}. */
export interface Theme {
  readonly mode: 'light' | 'dark';
  readonly colors: ThemeColors;
  readonly spacing: ThemeSpacing;
  readonly radii: ThemeRadii;
  readonly typography: ThemeTypography;
  readonly iconSizes: ThemeIconSizes;
  readonly shadow: ThemeShadow;
  readonly motion: ThemeMotion;
  readonly zIndex: ThemeZIndex;
  readonly hitSlop: ThemeHitSlop;
  readonly opacity: ThemeOpacity;
  readonly control: ThemeControl;
}

/**
 * Recursive `Partial` used by the public override surface.
 */
export type PartialTheme = {
  readonly [K in keyof Theme]?: Theme[K] extends object
    ? Theme[K] extends ReadonlyArray<unknown>
      ? Theme[K]
      : {
          readonly [K2 in keyof Theme[K]]?: Theme[K][K2] extends object
            ? { readonly [K3 in keyof Theme[K][K2]]?: Theme[K][K2][K3] }
            : Theme[K][K2];
        }
    : Theme[K];
};

/**
 * Tier-1 reference palette — raw, theme-agnostic colour ramps. The semantic
 * Tier-2 slots in `lightTokens` / `darkTokens` point at these so a hue is
 * defined once. Internal: not exported (consumers override Tier-2 via the
 * `theme` prop, which is the stable public surface). Greys are a single neutral
 * ramp; status hues carry the light + dark variants the panel actually uses.
 *
 * @internal
 */
const palette = {
  gray: {
    0: '#ffffff',
    50: '#fafafb',
    100: '#f4f4f5',
    150: '#e7e7ea',
    200: '#e3e3e8',
    300: '#c9c9d1',
    400: '#9a9aa3',
    500: '#71717a', // ≥4.5:1 on gray.100 — the new accessible "subtle" text
    600: '#6b6b76',
    700: '#3c3c45',
    750: '#2a2a31',
    800: '#26262d',
    850: '#1a1a1f',
    900: '#15151a',
    950: '#0e0e11',
    1000: '#000000',
  },
  chrome: {
    bg: '#1c1c22',
    bgRaised: '#2c2c34',
    text: '#f5f5f7',
    // Lightened from #9a9aa3 (~4.4:1) → ~5.1:1 on chromeBg.
    textMuted: '#a8a8b3',
  },
  blue: { 500: '#0a7aff', 600: '#0865d6', light: '#3a93ff', lightPressed: '#1f7be0' },
  green: { 500: '#16a34a', dark: '#0a7a55', light: '#34d399' },
  // amber.600 (#a35600) is the AA-on-white body warn; amber.500 stays for badges.
  amber: { 500: '#d97706', 600: '#a35600', badge: '#c87000', light: '#fbbf24' },
  red: { 500: '#dc2626', badge: '#c1272d', light: '#f87171' },
  sky: { 500: '#0ea5e9', light: '#38bdf8' },
  violet: { 500: '#7c3aed', light: '#a78bfa' },
} as const;

/** Shared motion tokens — one rhythm for every panel animation. */
const sharedMotion: ThemeMotion = {
  duration: { instant: 0, fast: 150, base: 220, slow: 320 },
  easing: {
    standard: [0.2, 0, 0, 1],
    decelerate: [0, 0, 0, 1],
    accelerate: [0.3, 0, 1, 1],
  },
};

/** Shared stacking scale — replaces the overlay's magic 9999. */
const sharedZIndex: ThemeZIndex = {
  base: 0,
  sticky: 10,
  overlay: 1000,
  sheet: 1100,
  toast: 1200,
};

/** Shared hitSlop scale so small glyph buttons reach ≥44pt. */
const sharedHitSlop: ThemeHitSlop = {
  tight: 6,
  default: 10,
  loose: 14,
};

/** Shared interaction opacities. */
const sharedOpacity: ThemeOpacity = {
  pressed: 0.7,
  pressedSubtle: 0.6,
  disabled: 0.4,
};

/** Comfortable control heights (default density). `lg` = the 44pt touch floor. */
const sharedControl: ThemeControl = {
  sm: 32,
  md: 40,
  lg: 44,
};

const sharedSpacing: ThemeSpacing = {
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  safeTop: 44,
};

const sharedRadii: ThemeRadii = {
  sm: 4,
  md: 6,
  lg: 10,
  pill: 999,
};

const sharedIconSizes: ThemeIconSizes = {
  sm: 14,
  md: 18,
  lg: 24,
};

const sharedTypography: ThemeTypography = {
  // line-heights are ~1.3–1.45× size so wrapped log messages / breadcrumbs read
  // comfortably; single-line rows are unaffected (RN clamps to one line anyway).
  caption: { size: 12, weight: '500', lineHeight: 16 },
  // Body bumped 13 → 14 (readable-minimum for primary data; Dynamic-Type-friendly).
  body: { size: 14, weight: '400', lineHeight: 20 },
  label: { size: 13, weight: '600', lineHeight: 18 },
  title: { size: 15, weight: '700', lineHeight: 20 },
  heading: { size: 17, weight: '700', lineHeight: 22 },
  display: { size: 20, weight: '700', lineHeight: 26 },
  mono: 'Menlo',
};

/** Default light palette. Neutral grays + iOS-blue accent. */
export const lightTokens: Theme = {
  mode: 'light',
  spacing: sharedSpacing,
  radii: sharedRadii,
  typography: sharedTypography,
  iconSizes: sharedIconSizes,
  motion: sharedMotion,
  zIndex: sharedZIndex,
  hitSlop: sharedHitSlop,
  opacity: sharedOpacity,
  control: sharedControl,
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  colors: {
    surface: palette.gray[0],
    surfaceSubtle: palette.gray[100],
    surfaceMuted: palette.gray[150],
    surfaceRaised: palette.gray[0],
    chromeBg: palette.chrome.bg,
    chromeBgRaised: palette.chrome.bgRaised,
    chromeText: palette.chrome.text,
    // Lightened to ~5.1:1 on chromeBg (was #9a9aa3 ≈ 4.4:1).
    chromeTextMuted: palette.chrome.textMuted,
    text: palette.gray[850],
    textMuted: palette.gray[600],
    // Darkened #9a9aa3 → #71717a so subtle text clears 4.5:1 on surfaceSubtle.
    textSubtle: palette.gray[500],
    textInverse: palette.gray[0],
    accent: palette.blue[500],
    accentPressed: palette.blue[600],
    accentSoft: 'rgba(10,122,255,0.10)',
    surfaceHover: palette.gray[50],
    border: palette.gray[200],
    borderStrong: palette.gray[300],
    focusRing: palette.blue[500],
    skeletonBase: palette.gray[150],
    skeletonHighlight: palette.gray[100],
    // ≥0.40 so a sheet's scrim isolates foreground content (modal legibility).
    backdrop: 'rgba(0,0,0,0.4)',
    success: palette.green[500],
    warning: palette.amber[500],
    danger: palette.red[500],
    info: palette.sky[500],
    logLevel: {
      debug: '#7d7d88',
      info: palette.green.dark,
      // Body warn darkened to #a35600 (~4.6:1 on white); the badge keeps the
      // brighter #c87000 (large/bold passes at 3:1).
      warn: palette.amber[600],
      error: palette.red.badge,
    },
    method: {
      get: palette.green.dark,
      post: palette.blue[500],
      put: palette.amber.badge,
      patch: palette.violet[500],
      delete: palette.red.badge,
      other: palette.gray[600],
    },
    tint: {
      debug: 'transparent',
      info: 'transparent',
      warn: 'rgba(217,119,6,0.07)',
      error: 'rgba(220,38,38,0.06)',
      success: 'rgba(22,163,74,0.06)',
    },
  },
};

/** Default dark palette. iOS-13 inspired neutrals. */
export const darkTokens: Theme = {
  mode: 'dark',
  spacing: sharedSpacing,
  radii: sharedRadii,
  typography: sharedTypography,
  iconSizes: sharedIconSizes,
  motion: sharedMotion,
  zIndex: sharedZIndex,
  hitSlop: sharedHitSlop,
  opacity: sharedOpacity,
  control: sharedControl,
  shadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
  colors: {
    surface: palette.gray[950],
    surfaceSubtle: palette.gray[850],
    surfaceMuted: palette.gray[800],
    surfaceRaised: palette.gray[850],
    chromeBg: palette.gray[1000],
    chromeBgRaised: palette.gray[800],
    chromeText: palette.chrome.text,
    chromeTextMuted: palette.gray[400],
    text: palette.chrome.text,
    textMuted: '#a3a3ad',
    textSubtle: palette.gray[600],
    textInverse: palette.gray[0],
    accent: palette.blue.light,
    accentPressed: palette.blue.lightPressed,
    accentSoft: 'rgba(58,147,255,0.16)',
    surfaceHover: palette.gray[900],
    border: palette.gray[750],
    borderStrong: palette.gray[700],
    focusRing: palette.blue.light,
    skeletonBase: palette.gray[800],
    skeletonHighlight: palette.gray[750],
    backdrop: 'rgba(0,0,0,0.55)',
    success: palette.green.light,
    warning: palette.amber.light,
    danger: palette.red.light,
    info: palette.sky.light,
    logLevel: {
      debug: palette.gray[400],
      info: palette.green.light,
      warn: palette.amber.light,
      error: palette.red.light,
    },
    method: {
      get: palette.green.light,
      post: palette.blue.light,
      put: palette.amber.light,
      patch: palette.violet.light,
      delete: palette.red.light,
      other: '#a3a3ad',
    },
    tint: {
      debug: 'transparent',
      info: 'transparent',
      warn: 'rgba(251,191,36,0.10)',
      error: 'rgba(248,113,113,0.10)',
      success: 'rgba(52,211,153,0.08)',
    },
  },
};

/**
 * Optional named theme presets beyond the built-in light/dark. Pass one to
 * `DebugPanelProvider`'s `theme` prop (it deep-merges over the resolved base):
 *
 * ```tsx
 * import { themePresets } from 'react-native-observability/panel';
 * <DebugPanelProvider mode="dark" theme={themePresets.midnight} />
 * ```
 *
 * Presets are `PartialTheme` overrides (not full themes) so they layer cleanly
 * on either base and stay small.
 */
export const themePresets: Readonly<Record<'midnight' | 'paper' | 'highContrast', PartialTheme>> = {
  /**
   * True-black OLED surfaces with a violet accent. It overrides surface colours,
   * so it applies in **both** light and dark — pin `mode="dark"` rather than
   * exposing a light/dark switcher, or it will paint light mode dark too.
   */
  midnight: {
    colors: {
      surface: '#000000',
      surfaceSubtle: '#0c0c11',
      surfaceMuted: '#16161d',
      surfaceRaised: '#0c0c11',
      chromeBg: '#000000',
      chromeBgRaised: '#16161d',
      accent: '#a78bfa',
      accentPressed: '#8b5cf6',
      border: '#1c1c24',
      borderStrong: '#2c2c38',
    },
  },
  /**
   * Warm off-white "paper" surfaces with a softer chrome — a calmer light theme
   * for long debugging sessions. Light-oriented; pair with `mode="light"`.
   */
  paper: {
    colors: {
      surface: '#fbfaf7',
      surfaceSubtle: '#f1efe9',
      surfaceMuted: '#e6e3da',
      surfaceRaised: '#ffffff',
      surfaceHover: '#f6f4ef',
      chromeBg: '#2b2a26',
      chromeBgRaised: '#3a3833',
      border: '#e2ded3',
      borderStrong: '#cdc8ba',
    },
  },
  /**
   * Maximum-contrast pairing for accessibility — near-black text on white,
   * thicker borders, and a stronger accent. Bumps text pairs toward AAA. Apply
   * with `mode="light"` (a dark high-contrast variant can layer over `mode="dark"`).
   */
  highContrast: {
    colors: {
      text: '#000000',
      textMuted: '#2b2b30',
      textSubtle: '#45454d',
      border: '#8a8a93',
      borderStrong: '#5a5a63',
      accent: '#0a56c2',
      accentPressed: '#073f8e',
      logLevel: { debug: '#3a3a42', info: '#005c3a', warn: '#8a4b00', error: '#a4161a' },
    },
  },
};
