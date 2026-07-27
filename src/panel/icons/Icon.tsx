import React from 'react';
import { Text, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import type { Theme } from '../theme';
import { useIconSet } from './IconSet';

/**
 * The panel's icon vocabulary — a small, stable set of semantic names. Every
 * structural glyph in the panel (close, caret, search, copy, refresh, …) is
 * referenced by one of these names instead of an inline Unicode character, so
 * the vocabulary is centralised and a later swap to a vector set is a one-file
 * change ({@link GLYPHS}) rather than a hunt across every component.
 */
export type IconName =
  | 'close'
  | 'chevron-down'
  | 'chevron-right'
  | 'search'
  | 'copy'
  | 'refresh'
  | 'share'
  | 'network'
  | 'navigation'
  | 'flag'
  | 'clock'
  | 'diamond'
  | 'circle'
  | 'list'
  | 'warning'
  | 'check'
  | 'dot'
  | 'info';

/**
 * Name → glyph map. **The single place** the panel's icon rendering is defined.
 *
 * Today these are Unicode glyphs (zero icon-font / SVG dependency, consistent
 * with the package's no-forced-dependency rule). Swapping to a vector set later
 * means replacing this map (and the `<Text>` in {@link Icon}) with vector
 * renderers — no call-site changes, because every site already uses
 * {@link IconName}.
 */
const GLYPHS: Readonly<Record<IconName, string>> = {
  close: '✕',
  'chevron-down': '▾',
  'chevron-right': '▸',
  search: '⌕',
  copy: '⧉',
  refresh: '⟳',
  share: '↥',
  network: '↦',
  navigation: '⤳',
  flag: '⚑',
  clock: '◷',
  diamond: '◆',
  circle: '○',
  list: '≡',
  warning: '⚠',
  check: '✓',
  dot: '●',
  info: 'ⓘ',
};

/** Semantic tone — resolves to a theme colour. Mirrors `TextX`'s tone set. */
type IconTone = 'default' | 'muted' | 'subtle' | 'inverse' | 'accent' | 'danger' | 'success';

export interface IconProps {
  /** Which icon to render (see {@link IconName}). */
  readonly name: IconName;
  /**
   * Glyph size. A key on the theme's `iconSizes` scale (`sm`/`md`/`lg`) or an
   * explicit number for the few one-off sizes (e.g. a 13px inline caret).
   * Default: `'md'`.
   */
  readonly size?: keyof Theme['iconSizes'] | number;
  /** Semantic colour. Default: `'default'`. */
  readonly tone?: IconTone;
  /**
   * Accessibility label. **Required** unless {@link decorative} is set — an icon
   * that conveys meaning must be announced. When the icon sits inside a labelled
   * `Pressable`/`Button`, mark it `decorative` so it isn't double-announced.
   */
  readonly accessibilityLabel?: string;
  /**
   * Hide the icon from the accessibility tree (it's purely decorative, or its
   * parent control already carries the label).
   */
  readonly decorative?: boolean;
  readonly style?: StyleProp<TextStyle>;
}

function toneColor(t: Theme, tone: IconTone): string {
  switch (tone) {
    case 'muted':
      return t.colors.textMuted;
    case 'subtle':
      return t.colors.textSubtle;
    case 'inverse':
      return t.colors.textInverse;
    case 'accent':
      return t.colors.accent;
    case 'danger':
      return t.colors.danger;
    case 'success':
      return t.colors.success;
    default:
      return t.colors.text;
  }
}

/**
 * Renders a panel icon by semantic name, sized + tinted from theme tokens.
 *
 * Use this instead of an inline glyph anywhere an icon stands on its own (a
 * button, a caret, a search affordance). It centralises the glyph vocabulary
 * ({@link GLYPHS}), keeps sizing on the `iconSizes` scale, and makes the icon
 * theme-tintable — so a future move to a vector icon set touches one file.
 *
 * @example
 * ```tsx
 * <Icon name="close" size="sm" tone="muted" accessibilityLabel="Close" />
 * // inside an already-labelled button:
 * <Pressable accessibilityLabel="Copy"><Icon name="copy" decorative /></Pressable>
 * ```
 */
export function Icon({
  name,
  size = 'md',
  tone = 'default',
  accessibilityLabel,
  decorative,
  style,
}: IconProps): React.ReactElement {
  const t = useTheme();
  const iconSet = useIconSet();
  const fontSize = typeof size === 'number' ? size : t.iconSizes[size];
  const color = toneColor(t, tone);

  // A meaningful icon is announced; a decorative one is hidden from AT.
  const a11y = decorative
    ? ({
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no' as const,
      } as const)
    : ({
        accessibilityRole: 'image' as const,
        ...(accessibilityLabel !== undefined ? { accessibilityLabel } : {}),
      } as const);

  // A consumer-injected renderer (e.g. a Lucide glyph) wins; it gets the same
  // resolved size + colour so it matches the built-in icons. Returning null
  // falls through to the Unicode glyph.
  const custom = iconSet?.[name]?.({ name, size: fontSize, color });
  if (custom != null) {
    return (
      <View {...a11y} style={style as StyleProp<ViewStyle>}>
        {custom}
      </View>
    );
  }

  return (
    <Text
      {...a11y}
      allowFontScaling={false}
      style={[{ fontSize, lineHeight: fontSize + 2, color }, style]}
    >
      {GLYPHS[name]}
    </Text>
  );
}
