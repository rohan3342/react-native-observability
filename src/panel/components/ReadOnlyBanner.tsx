import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

/**
 * A thin banner shown above a tab body when the user is viewing a **past**
 * session (selected in the header). Signals that the data is a read-only
 * snapshot and that live logging continues separately on the current session.
 */
export function ReadOnlyBanner({ label }: { label?: string }): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View
      style={styles.root}
      accessibilityRole="text"
      accessibilityLabel={`Viewing a past session, read-only. ${label ?? ''}`}
    >
      <TextX variant="caption" style={styles.text}>
        ⏷ Past session · read-only{label !== undefined ? ` · ${label}` : ''}
      </TextX>
    </View>
  );
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    root: {
      backgroundColor: t.colors.accentSoft,
      paddingVertical: t.spacing.sm + 1,
      paddingHorizontal: t.spacing.lg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    text: { color: t.colors.accent, fontWeight: '600' },
  });
}
