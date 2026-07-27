import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type {
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  TextProps,
  TextStyle,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { useTheme } from './useTheme';
import type { Theme } from './tokens';

/**
 * Reads the `focused` flag from a Pressable render-prop state in a type-safe
 * way (the RN type lib doesn't always declare it, though it exists at runtime on
 * platforms with focus traversal). Kept in the theme layer so primitives and
 * components share one accessor without a cross-layer import.
 */
export function isFocused(state: PressableStateCallbackType): boolean {
  return (state as PressableStateCallbackType & { focused?: boolean }).focused === true;
}

// ─── Surface ─────────────────────────────────────────────────────────────

export interface SurfaceProps extends ViewProps {
  /** Visual elevation level. `base` matches the panel background; `subtle`
   *  is the search-input grey; `raised` is the floating detail-sheet. */
  readonly variant?: 'base' | 'subtle' | 'raised';
  /** Adds a 1px border in the theme's border color. */
  readonly bordered?: boolean;
  /** Padding shortcut — token key on `spacing`. */
  readonly padding?: keyof Theme['spacing'];
  /** Border radius shortcut — token key on `radii`. */
  readonly radius?: keyof Theme['radii'];
}

/**
 * Layered background block. Use instead of bare `<View>` whenever a
 * component needs a themed background, border, or radius.
 */
export function Surface({
  variant = 'base',
  bordered,
  padding,
  radius,
  style,
  ...rest
}: SurfaceProps): React.ReactElement {
  const t = useTheme();
  const computed: ViewStyle = {
    backgroundColor:
      variant === 'raised'
        ? t.colors.surfaceRaised
        : variant === 'subtle'
          ? t.colors.surfaceSubtle
          : t.colors.surface,
    borderWidth: bordered === true ? StyleSheet.hairlineWidth : 0,
    borderColor: t.colors.border,
    padding: padding !== undefined ? t.spacing[padding] : undefined,
    borderRadius: radius !== undefined ? t.radii[radius] : undefined,
  };
  return <View {...rest} style={[computed, style]} />;
}

// ─── Text variants ───────────────────────────────────────────────────────

export interface TextXProps extends TextProps {
  /** Type ramp slot. */
  readonly variant?: 'caption' | 'body' | 'label' | 'title' | 'heading' | 'display';
  /** Semantic tone — picks a colour from the active theme. */
  readonly tone?:
    | 'default'
    | 'muted'
    | 'subtle'
    | 'inverse'
    | 'accent'
    | 'danger'
    | 'success'
    | 'warning';
  /** Render as monospace. */
  readonly mono?: boolean | undefined;
  /** Override the variant's default weight. */
  readonly weight?: TextStyle['fontWeight'];
}

/**
 * Themed `<Text>`. Maps a small set of variants and tones onto the active
 * theme's type ramp and color palette.
 */
export function TextX({
  variant = 'body',
  tone = 'default',
  mono,
  weight,
  style,
  ...rest
}: TextXProps): React.ReactElement {
  const t = useTheme();
  const ramp = t.typography[variant];
  const computed: TextStyle = {
    fontSize: ramp.size,
    fontWeight: weight ?? ramp.weight,
    // Apply the token line-height when the step defines one (multi-line measure);
    // single-line rows are unaffected. A caller's `style` can still override.
    ...(ramp.lineHeight !== undefined ? { lineHeight: ramp.lineHeight } : {}),
    // Mono uses the data family; everything else uses the injected UI sans
    // (undefined → platform system font).
    fontFamily: mono === true ? t.typography.mono : t.typography.sans,
    color:
      tone === 'muted'
        ? t.colors.textMuted
        : tone === 'subtle'
          ? t.colors.textSubtle
          : tone === 'inverse'
            ? t.colors.textInverse
            : tone === 'accent'
              ? t.colors.accent
              : tone === 'danger'
                ? t.colors.danger
                : tone === 'success'
                  ? t.colors.success
                  : tone === 'warning'
                    ? t.colors.warning
                    : t.colors.text,
  };
  return <Text {...rest} style={[computed, style]} />;
}

// ─── Button ──────────────────────────────────────────────────────────────

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  readonly label: string;
  /** `primary` is filled accent; `secondary` is subtle surface; `danger` is
   *  destructive accent; `ghost` is borderless text-only. */
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** Compact (`sm`) or default (`md`). */
  readonly size?: 'sm' | 'md';
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * Themed pressable button. Drives the panel's CTA appearance from tokens
 * so every button — header close, settings actions, detail-sheet share —
 * stays visually consistent.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  ...rest
}: ButtonProps): React.ReactElement {
  const t = useTheme();
  const { container, text } = useMemo(() => {
    const padV = size === 'sm' ? t.spacing.sm : t.spacing.md;
    const padH = size === 'sm' ? t.spacing.md : t.spacing.lg;
    const baseContainer: ViewStyle = {
      paddingVertical: padV,
      paddingHorizontal: padH,
      // `sm` buttons sit inline next to other controls (detail-sheet actions),
      // so they use the small control height; default buttons use the touch floor.
      minHeight: size === 'sm' ? t.control.sm : t.control.lg,
      borderRadius: t.radii.md,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: disabled === true ? t.opacity.disabled : 1,
    };
    if (variant === 'primary') {
      return {
        container: { ...baseContainer, backgroundColor: t.colors.accent },
        text: {
          color: t.colors.textInverse,
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: '600' as const,
        },
      };
    }
    if (variant === 'danger') {
      return {
        container: { ...baseContainer, backgroundColor: t.colors.danger },
        text: {
          color: t.colors.textInverse,
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: '600' as const,
        },
      };
    }
    if (variant === 'ghost') {
      return {
        container: { ...baseContainer, backgroundColor: 'transparent' },
        text: {
          color: t.colors.accent,
          fontSize: size === 'sm' ? 12 : 13,
          fontWeight: '600' as const,
        },
      };
    }
    // secondary
    return {
      container: {
        ...baseContainer,
        backgroundColor: t.colors.surfaceSubtle,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: t.colors.border,
      },
      text: { color: t.colors.text, fontSize: size === 'sm' ? 12 : 13, fontWeight: '600' as const },
    };
  }, [t, variant, size, disabled]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      style={state => [
        container,
        isFocused(state) && { borderWidth: 2, borderColor: t.colors.focusRing },
        state.pressed && pressedOverlay,
        style,
      ]}
      {...rest}
    >
      <Text style={text}>{label}</Text>
    </Pressable>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };

// ─── Pill ────────────────────────────────────────────────────────────────

export interface PillProps {
  readonly label: string;
  readonly active?: boolean;
  /** Optional count appended to the label, e.g. "Info (12)". */
  readonly count?: number | undefined;
  /** Optional explicit accent — overrides the theme accent when active. */
  readonly accent?: string | undefined;
  /** Optional leading badge content (kept tiny — e.g. "LIVE"). */
  readonly badge?: string | undefined;
  onPress(): void;
  readonly accessibilityLabel?: string;
}

/**
 * Compact toggle chip used by filter rows, session selectors, and the
 * level pills inside detail sheets.
 */
export function Pill({
  label,
  active = false,
  count,
  accent,
  badge,
  onPress,
  accessibilityLabel,
}: PillProps): React.ReactElement {
  const t = useTheme();
  const accentColor = accent ?? t.colors.accent;
  const display = count !== undefined ? `${label} (${count})` : label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? `${label}${count !== undefined ? `, ${count} entries` : ''}`
      }
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={state => {
        const focused = isFocused(state);
        return [
          {
            paddingHorizontal: t.spacing.md + 2,
            paddingVertical: t.spacing.sm + 1,
            // Clear the 44pt touch floor without changing the visual chip height
            // (content stays centred; the extra is tappable padding).
            minHeight: t.control.lg,
            borderRadius: t.radii.lg,
            // A 2px focus ring on keyboard/AT focus; otherwise the hairline border.
            borderWidth: focused ? 2 : StyleSheet.hairlineWidth,
            borderColor: focused ? t.colors.focusRing : active ? accentColor : t.colors.border,
            backgroundColor: active ? accentColor : t.colors.surfaceSubtle,
            flexDirection: 'row' as const,
            alignItems: 'center' as const,
            gap: 4,
          },
          state.pressed && pressedOverlay,
        ];
      }}
    >
      {badge !== undefined ? (
        <Text
          style={{
            fontSize: 9,
            fontWeight: '700',
            color: active ? t.colors.textInverse : t.colors.textMuted,
            letterSpacing: 0.5,
          }}
        >
          {badge}
        </Text>
      ) : null}
      <Text
        style={{
          fontSize: 12,
          fontWeight: active ? '700' : '500',
          color: active ? t.colors.textInverse : t.colors.text,
        }}
      >
        {display}
      </Text>
    </Pressable>
  );
}

// ─── Hairline ────────────────────────────────────────────────────────────

/**
 * 1-physical-pixel divider in the theme border color. Replaces ad-hoc
 * `borderBottomWidth: StyleSheet.hairlineWidth` lines.
 */
export function Hairline({ style }: { style?: StyleProp<ViewStyle> }): React.ReactElement {
  const t = useTheme();
  return (
    <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }, style]} />
  );
}

// ─── Spacer ──────────────────────────────────────────────────────────────

/**
 * Token-driven gap. Use sparingly — prefer parent `gap` — but useful in
 * row layouts where one cell needs to expand.
 */
export function Spacer({
  size = 'md',
  flex,
}: {
  size?: keyof Theme['spacing'];
  flex?: boolean;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View
      style={{
        width: t.spacing[size],
        height: t.spacing[size],
        flex: flex === true ? 1 : undefined,
      }}
    />
  );
}
