import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import type { IconName } from '../icons';

/**
 * Shared empty-state block used by tab bodies (no data, no matching filter,
 * unconfigured source).
 *
 * Renders a muted glyph tile above the title + hint so an empty view reads as a
 * deliberate state, not a blank screen. The glyph is a Unicode mark (the panel
 * ships no icon-font dependency); pass `glyph` to match the surface (e.g. a
 * magnifier for "no matches", a wave for "no network").
 */
export function EmptyState({
  title,
  hint,
  icon,
  glyph,
}: {
  title: string;
  hint: string;
  /**
   * Tile icon by semantic name — rendered through the {@link Icon} atom (sized +
   * tinted from tokens). Preferred over {@link glyph}.
   */
  icon?: IconName;
  /**
   * Raw glyph fallback (back-compat). Ignored when {@link icon} is set. Defaults
   * to a neutral circle when neither is provided.
   */
  glyph?: string;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.root} accessibilityRole="text" accessibilityLabel={`${title}. ${hint}`}>
      <View style={styles.glyphTile} importantForAccessibility="no">
        {icon !== undefined ? (
          <Icon name={icon} size="lg" tone="subtle" decorative />
        ) : (
          <Text style={styles.glyph}>{glyph ?? '○'}</Text>
        )}
      </View>
      <TextX variant="title" tone="muted">
        {title}
      </TextX>
      <TextX variant="caption" tone="subtle" style={styles.hint}>
        {hint}
      </TextX>
    </View>
  );
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: t.spacing.xl,
      gap: t.spacing.sm + 2,
    },
    glyphTile: {
      width: 56,
      height: 56,
      borderRadius: t.radii.pill,
      backgroundColor: t.colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: t.spacing.sm,
    },
    glyph: { fontSize: t.iconSizes.lg, color: t.colors.textSubtle, lineHeight: 28 },
    hint: { textAlign: 'center', maxWidth: 280 },
  });
}
