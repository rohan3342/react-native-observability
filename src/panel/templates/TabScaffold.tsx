import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme';
import type { Theme } from '../theme';

export interface TabScaffoldProps {
  /**
   * Sticky toolbar region rendered above the body — typically a {@link TabToolbar}.
   * It never scrolls; the body owns scrolling. Omit for tabs with no toolbar.
   */
  readonly toolbar?: React.ReactNode;
  /** The scrolling body — a `FlatList` / `VirtualList` / `ScrollView`. */
  readonly children: React.ReactNode;
}

/**
 * The shared frame every panel tab sits in. It owns the one structural detail
 * that all six tabs previously copy-pasted: the negative-margin wrapper that
 * lets the body bleed to the panel edges (the panel body adds `padding: xl`, and
 * dense list rows need to span the full width). It then stacks a sticky toolbar
 * over a flexible, edge-to-edge body.
 *
 * Using this instead of a bare `<View style={styles.root}>` per tab guarantees
 * every tab shares the same rhythm (toolbar height, body insets) and removes six
 * identical style blocks.
 */
export function TabScaffold({ toolbar, children }: TabScaffoldProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.root}>
      {toolbar !== undefined ? <View style={styles.toolbar}>{toolbar}</View> : null}
      <View style={styles.body}>{children}</View>
    </View>
  );
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    // Bleed past the panel body's `padding: xl` so dense rows span full width —
    // the exact wrapper each tab used to declare for itself.
    root: { flex: 1, marginHorizontal: -t.spacing.xl, marginTop: -t.spacing.xl },
    // The toolbar sits flush at the top; it sizes to content and never scrolls.
    toolbar: { flexShrink: 0 },
    body: { flex: 1 },
  });
}
