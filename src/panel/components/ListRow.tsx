import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { TextX, useTheme, isFocused } from '../theme';
import type { Theme } from '../theme';

/**
 * A dense, consistent list row — the shared building block for the Logs,
 * Network, Navigation, and Performance lists. Gives every tab the same
 * devtools-style density, press feedback, hairline divider, and optional
 * severity tint, instead of each tab re-implementing its own row.
 *
 * Layout: `[leading] title (+ subtitle/meta)  …  [trailing]`.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  tint,
  onPress,
  onLongPress,
  accessibilityLabel,
  accessibilityHint,
  titleMono,
  titleNumberOfLines = 1,
}: {
  /** Optional leading element — a level/method badge. */
  leading?: React.ReactNode;
  /** Primary line. A string is rendered with the row's title style. */
  title: React.ReactNode;
  /** Secondary line under the title (e.g. namespace · time). */
  subtitle?: React.ReactNode;
  /** Right-aligned metadata line shown under `trailing` is not used; prefer `meta` inline. */
  meta?: React.ReactNode;
  /** Trailing element — status code, chevron, duration. */
  trailing?: React.ReactNode;
  /** Soft background wash for at-a-glance severity (theme `colors.tint`). */
  tint?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  /** Extra context announced after the label (e.g. the long-press action). */
  accessibilityHint?: string;
  /** Render the title in monospace (raw values / URLs). */
  titleMono?: boolean;
  titleNumberOfLines?: number;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const tintStyle: ViewStyle | undefined =
    tint !== undefined && tint !== 'transparent' ? { backgroundColor: tint } : undefined;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={onPress === undefined && onLongPress === undefined}
      accessibilityRole={onPress !== undefined ? 'button' : 'text'}
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
      {...(accessibilityHint !== undefined ? { accessibilityHint } : {})}
      style={state => [
        styles.row,
        tintStyle,
        isFocused(state) && styles.rowFocused,
        state.pressed && styles.pressed,
      ]}
    >
      {leading !== undefined ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.body}>
        {typeof title === 'string' ? (
          <TextX variant="body" mono={titleMono} numberOfLines={titleNumberOfLines}>
            {title}
          </TextX>
        ) : (
          title
        )}
        {subtitle !== undefined ? (
          typeof subtitle === 'string' ? (
            <TextX variant="caption" tone="muted" numberOfLines={1} style={styles.subtitle}>
              {subtitle}
            </TextX>
          ) : (
            <View style={styles.subtitle}>{subtitle}</View>
          )
        ) : null}
        {meta !== undefined ? <View style={styles.subtitle}>{meta}</View> : null}
      </View>
      {trailing !== undefined ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.md,
      // Two-line rows already clear this, but a one-line row (e.g. a summary
      // with no subtitle) is guaranteed the touch floor.
      minHeight: t.control.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    pressed: { backgroundColor: t.colors.surfaceHover },
    rowFocused: {
      borderWidth: 2,
      borderColor: t.colors.focusRing,
    },
    leading: { justifyContent: 'center' },
    body: { flex: 1, gap: 1 },
    subtitle: { marginTop: 1 },
    trailing: { justifyContent: 'center', alignItems: 'flex-end' },
  });
}

/**
 * Small-caps section header with an optional trailing accessory and a count —
 * the shared structure header used across tabs (replaces ad-hoc inline labels).
 */
export function GroupHeader({
  title,
  count,
  trailing,
  style,
}: {
  title: string;
  count?: number;
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildHeaderStyles(t), [t]);
  return (
    <View style={[styles.header, style]}>
      <TextX variant="caption" tone="subtle" style={styles.title} accessibilityRole="header">
        {count !== undefined ? `${title} · ${count}` : title}
      </TextX>
      {trailing !== undefined ? trailing : null}
    </View>
  );
}

function buildHeaderStyles(t: Theme) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.lg,
      paddingBottom: t.spacing.sm,
      backgroundColor: t.colors.surface,
    },
    title: { textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' },
  });
}

/**
 * A tiny status/label badge — a tinted rounded tag (e.g. a log level, a state
 * type, "LIVE"). Distinct from `Pill` (interactive filter) and `MethodBadge`
 * (HTTP-specific): this is a non-interactive label.
 */
export function Badge({
  label,
  color,
  filled,
}: {
  label: string;
  /** Foreground (and, when `filled`, derived background) color. Default: muted text. */
  color?: string;
  /** Solid background instead of tinted. */
  filled?: boolean;
}): React.ReactElement {
  const t = useTheme();
  const fg = color ?? t.colors.textMuted;
  return (
    <View
      style={{
        paddingHorizontal: t.spacing.sm + 1,
        paddingVertical: 1,
        borderRadius: t.radii.sm,
        backgroundColor: filled === true ? fg : t.colors.surfaceMuted,
        alignSelf: 'flex-start',
      }}
    >
      <TextX
        variant="caption"
        mono
        style={{
          fontSize: 10,
          fontWeight: '700',
          letterSpacing: 0.4,
          color: filled === true ? t.colors.textInverse : fg,
        }}
      >
        {label}
      </TextX>
    </View>
  );
}
