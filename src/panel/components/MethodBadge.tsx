import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

/** Resolve a theme colour for an HTTP method (case-insensitive). */
export function methodColor(t: Theme, method: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return t.colors.method.get;
    case 'POST':
      return t.colors.method.post;
    case 'PUT':
      return t.colors.method.put;
    case 'PATCH':
      return t.colors.method.patch;
    case 'DELETE':
      return t.colors.method.delete;
    default:
      return t.colors.method.other;
  }
}

/**
 * A small coloured pill for an HTTP method, mirroring the status badge so the
 * verb is scannable at a glance in the Network list and detail sheet. The
 * colour comes from the theme's `method` palette.
 */
export function MethodBadge({
  method,
  size = 'sm',
}: {
  method: string;
  size?: 'sm' | 'md';
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View
      style={[
        size === 'md' ? styles.badgeMd : styles.badge,
        { backgroundColor: methodColor(t, method) },
      ]}
    >
      <TextX mono tone="inverse" style={size === 'md' ? styles.textMd : styles.text}>
        {method.toUpperCase()}
      </TextX>
    </View>
  );
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    badge: {
      paddingHorizontal: t.spacing.sm,
      paddingVertical: 1,
      borderRadius: t.radii.sm,
      alignSelf: 'flex-start',
    },
    badgeMd: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radii.sm,
      alignSelf: 'flex-start',
    },
    text: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
    textMd: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  });
}
