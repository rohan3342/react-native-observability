/**
 * Shared presentational kit for the Expo example screens.
 *
 * Every screen composes the same vocabulary — `Screen` (themed scroll page),
 * `Hero` (brand spotlight header with a CTA), `Card` (titled section with an
 * icon), `Button` (icon + semantic variant), and `Badge`. All are theme-aware
 * via {@link useTheme}, so the demo follows the system light/dark scheme and
 * stays visually consistent with the panel it opens.
 */

import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, type Theme } from './theme';

/** Ionicons glyph name — re-exported so screens get autocomplete without the import. */
export type IconName = keyof typeof Ionicons.glyphMap;

/** A themed full-height scroll page. Wrap every screen's body in this. */
export function Screen({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: t.colors.bg }}
      contentContainerStyle={{
        paddingHorizontal: t.spacing.lg,
        paddingTop: t.spacing.md,
        gap: t.spacing.lg,
        paddingBottom: t.spacing.xxl + t.spacing.md,
      }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/** A small rounded icon tile — used in card headers and the hero. */
export function IconBubble({
  name,
  color,
  bg,
  size = 18,
}: {
  name: IconName;
  color: string;
  bg: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size + 18,
        height: size + 18,
        borderRadius: 10,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

/** Brand spotlight header with a title, blurb, and primary call-to-action. */
export function Hero({
  icon,
  title,
  subtitle,
  cta,
  onPressCta,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  cta: string;
  onPressCta: () => void;
}) {
  const t = useTheme();
  return (
    <View style={s(t).hero}>
      <View style={s(t).heroTop}>
        <IconBubble name={icon} color="#fff" bg="rgba(255,255,255,0.12)" size={20} />
        <Text style={s(t).heroTitle}>{title}</Text>
      </View>
      <Text style={s(t).heroSubtitle}>{subtitle}</Text>
      <Button
        label={cta}
        icon="observability-outline"
        variant="primary"
        wide
        onPress={onPressCta}
      />
    </View>
  );
}

/** A titled card. `icon` + `tint` render a coloured glyph tile in the header. */
export function Card({
  title,
  hint,
  icon,
  tint,
  children,
}: {
  title: string;
  hint?: string;
  icon?: IconName;
  tint?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const accent = tint ?? t.colors.accent;
  return (
    <View style={s(t).card}>
      <View style={s(t).cardHead}>
        {icon !== undefined ? (
          <IconBubble name={icon} color={accent} bg={withAlpha(accent, 0.1)} size={16} />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={s(t).cardTitle}>{title}</Text>
          {hint !== undefined ? <Text style={s(t).cardHint}>{hint}</Text> : null}
        </View>
      </View>
      <View style={s(t).grid}>{children}</View>
    </View>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'warn' | 'ghost';

/** A button with an optional leading icon and a semantic colour variant. */
export function Button({
  label,
  onPress,
  icon,
  variant = 'secondary',
  wide,
  disabled,
}: {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  icon?: IconName;
  variant?: ButtonVariant;
  wide?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  const { bg, fg, border } = variantColors(t, variant);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      style={({ pressed }) => [
        s(t).button,
        { backgroundColor: bg },
        border !== undefined ? { borderWidth: 1, borderColor: border } : null,
        wide === true && s(t).buttonWide,
        disabled === true && { opacity: 0.4 },
        pressed && { opacity: 0.72, transform: [{ scale: 0.98 }] },
      ]}
    >
      {icon !== undefined ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={[s(t).buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** A small status pill — `tone` picks the semantic colour. */
export function Badge({
  label,
  tone = 'info',
}: {
  label: string;
  tone?: 'success' | 'warn' | 'danger' | 'info' | 'neutral';
}) {
  const t = useTheme();
  const color =
    tone === 'success'
      ? t.colors.success
      : tone === 'warn'
        ? t.colors.warning
        : tone === 'danger'
          ? t.colors.danger
          : tone === 'neutral'
            ? t.colors.textMuted
            : t.colors.info;
  return (
    <View style={[s(t).badge, { backgroundColor: withAlpha(color, 0.14) }]}>
      <Text style={[s(t).badgeText, { color }]}>{label}</Text>
    </View>
  );
}

/** A label → value row for info cards. `value` may be text or a node (e.g. a Badge). */
export function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={s(t).infoRow}>
      <Text style={s(t).infoLabel}>{label}</Text>
      {typeof value === 'string' ? <Text style={s(t).infoValue}>{value}</Text> : value}
    </View>
  );
}

/** Throws on render when `shouldThrow` — drives the AppErrorBoundary demo. */
export function Bomb({ shouldThrow }: { shouldThrow: boolean }): null {
  if (shouldThrow) throw new Error('Demo render error from <Bomb />');
  return null;
}

/** Full-screen fallback rendered by the root AppErrorBoundary. */
export function ErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  const t = useTheme();
  // The root boundary replaces the whole app (navigator + insets), so the
  // fallback must own its safe area or it renders under the status bar / notch.
  return (
    <SafeAreaView style={[s(t).fallback, { backgroundColor: t.colors.bg }]}>
      <IconBubble
        name="warning-outline"
        color={t.colors.danger}
        bg={withAlpha(t.colors.danger, 0.14)}
        size={26}
      />
      <Text style={s(t).fallbackTitle}>Caught by AppErrorBoundary</Text>
      <Text style={s(t).fallbackBody}>{error.message}</Text>
      {/* Wrap so the button centers under the text — the Button's own
          alignSelf:'flex-start' would otherwise pull it to the left. */}
      <View style={s(t).fallbackAction}>
        <Button label="Retry" icon="refresh" variant="primary" onPress={retry} />
      </View>
    </SafeAreaView>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function variantColors(t: Theme, v: ButtonVariant): { bg: string; fg: string; border?: string } {
  switch (v) {
    case 'primary':
      return { bg: t.colors.accent, fg: t.colors.textInverse };
    case 'success':
      return { bg: t.colors.success, fg: '#fff' };
    case 'danger':
      return { bg: t.colors.danger, fg: '#fff' };
    case 'warn':
      return { bg: t.colors.warning, fg: '#1a1205' };
    case 'ghost':
      return { bg: 'transparent', fg: t.colors.text, border: t.colors.border };
    case 'secondary':
    default:
      return { bg: t.colors.surfaceSubtle, fg: t.colors.text };
  }
}

/** Apply an alpha to a #rrggbb hex; passthrough for rgba()/transparent. */
function withAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Theme-derived StyleSheet. Memoised per theme object identity by the caller's render. */
const s = (t: Theme) =>
  StyleSheet.create({
    hero: {
      backgroundColor: t.colors.spotlight,
      borderRadius: t.radii.lg,
      padding: t.spacing.xl,
      gap: t.spacing.md,
    },
    heroTop: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    heroTitle: { fontSize: t.type.heading, fontWeight: '700', color: t.colors.spotlightText },
    heroSubtitle: {
      fontSize: t.type.body,
      color: t.colors.spotlightTextMuted,
      lineHeight: 21,
    },
    card: {
      backgroundColor: t.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radii.lg,
      paddingVertical: t.spacing.lg,
      paddingHorizontal: t.spacing.lg,
      gap: t.spacing.lg,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md },
    cardTitle: { fontSize: t.type.title, fontWeight: '600', color: t.colors.text },
    cardHint: {
      fontSize: t.type.caption,
      color: t.colors.textMuted,
      marginTop: 3,
      lineHeight: 17,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    button: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: t.radii.md,
      alignSelf: 'flex-start',
    },
    buttonWide: { alignSelf: 'stretch', justifyContent: 'center', paddingVertical: 13 },
    buttonText: { fontWeight: '600', fontSize: t.type.label },
    badge: { paddingVertical: 3, paddingHorizontal: 9, borderRadius: t.radii.pill },
    badgeText: { fontSize: t.type.caption, fontWeight: '700' },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: t.spacing.md,
      paddingVertical: 2,
    },
    infoLabel: { fontSize: t.type.body, color: t.colors.textMuted },
    infoValue: {
      fontSize: t.type.body,
      color: t.colors.text,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    fallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xxl,
      gap: t.spacing.md,
    },
    fallbackTitle: {
      fontSize: t.type.heading,
      fontWeight: '700',
      color: t.colors.text,
      textAlign: 'center',
    },
    fallbackBody: {
      fontSize: t.type.body,
      color: t.colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    fallbackAction: { alignItems: 'center', marginTop: t.spacing.sm },
  });
