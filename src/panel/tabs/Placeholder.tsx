import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

/**
 * Shared empty-state component used by every tab body in Phase 7a.
 * Replaced per-tab in Phase 7b/7c when real content lands.
 *
 * @internal
 */
export function Placeholder({ title, hint }: { title: string; hint: string }): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.root} accessibilityRole="text" accessibilityLabel={`${title} — ${hint}`}>
      <TextX variant="title" tone="muted">
        {title}
      </TextX>
      <TextX variant="body" tone="subtle" style={styles.hint}>
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
      gap: t.spacing.md,
    },
    hint: { textAlign: 'center' },
  });
}
