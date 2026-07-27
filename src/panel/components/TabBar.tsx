import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import type { Theme } from '../theme';
import { TAB_LABELS } from '../types';
import type { DebugPanelTab } from '../types';

export interface TabBarProps {
  readonly tabs: readonly DebugPanelTab[];
  readonly active: DebugPanelTab;
  onSelect(tab: DebugPanelTab): void;
}

/**
 * Horizontal tab bar rendered under the panel header. Renders each tab as
 * plain text; the active tab is marked by a 2px bottom underline directly
 * under the label (devtool / Chrome-style tabs). Each tab carries
 * `accessibilityRole="tab"` and `accessibilityState={{ selected }}` per
 * RN Modal a11y guidance.
 */
export function TabBar({ tabs, active, onSelect }: TabBarProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroller}
      accessibilityRole="tablist"
    >
      {tabs.map(tab => {
        const isActive = tab === active;
        return (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={`${TAB_LABELS[tab]} tab`}
            accessibilityState={{ selected: isActive }}
            onPress={() => onSelect(tab)}
            // The underline must hug the bottom edge, so we can't pad below it.
            // hitSlop extends the tap area downward to reach the ≥44pt minimum.
            hitSlop={{ top: 8, bottom: 14 }}
            style={({ pressed }) => [styles.tab, pressed && pressedOverlay]}
          >
            <Text style={[styles.label, isActive && styles.labelActive]}>{TAB_LABELS[tab]}</Text>
            <View style={[styles.indicator, isActive && styles.indicatorActive]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    // flexGrow: 0 — horizontal ScrollView would otherwise stretch to fill the
    // parent column's free vertical space and push everything else off-layout.
    scroller: { flexGrow: 0, flexShrink: 0 },
    row: { paddingHorizontal: t.spacing.lg, gap: t.spacing.xl, alignItems: 'flex-end' },
    tab: {
      paddingTop: t.spacing.md,
      alignItems: 'center',
      gap: t.spacing.sm,
    },
    label: { fontSize: 14, color: t.colors.textMuted, fontWeight: '500' },
    labelActive: { color: t.colors.text, fontWeight: '700' },
    // Always render a 2px strip; the inactive one is transparent so layout
    // stays identical across selection — prevents a 2px shift when tabs swap.
    indicator: { height: 2, alignSelf: 'stretch', backgroundColor: 'transparent' },
    // Accent underline reads as "selected" more clearly than a text-coloured one
    // (devtools convention) while weight still carries the state for color-blind.
    indicatorActive: { backgroundColor: t.colors.accent },
  });
}
