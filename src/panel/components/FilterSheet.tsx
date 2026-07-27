import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Overlay } from './Overlay';
import { Hairline, TextX, Button, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';

/** One selectable option within a filter group. */
export interface FilterOption {
  readonly value: string;
  readonly label?: string;
  /** Optional leading colour dot (e.g. HTTP method colour). */
  readonly dotColor?: string;
}

/** A named, multi-select group of options shown in the sheet. */
export interface FilterGroup {
  /** Stable key used in the selection map. */
  readonly key: string;
  /** Small-caps header, e.g. "NAMESPACE". */
  readonly label: string;
  readonly options: readonly FilterOption[];
}

/** Map of group key → selected option values. Empty array = no filter on that group. */
export type FilterSelections = Record<string, readonly string[]>;

/**
 * A bottom-sheet multi-select filter editor. Selections are **staged** inside
 * the sheet and only committed on **Apply**; **Clear** empties every group. Used
 * by the Logs (NAMESPACE / SCREEN) and Network (METHOD / SCREEN) tabs in place
 * of inline chip rows that overflow once there are many values.
 *
 * Each group is independent multi-select: tapping a chip toggles it; an empty
 * group means "no filter" (show all).
 */
export function FilterSheet({
  visible,
  groups,
  selections,
  onApply,
  onClear,
  onClose,
}: {
  readonly visible: boolean;
  readonly groups: readonly FilterGroup[];
  /** Currently-applied selections (the sheet seeds its draft from these on open). */
  readonly selections: FilterSelections;
  onApply(next: FilterSelections): void;
  onClear(): void;
  onClose(): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);

  // Staged draft, seeded from the applied selections each time the sheet opens.
  const [draft, setDraft] = useState<FilterSelections>(selections);
  const seededFor = React.useRef(false);
  if (visible && !seededFor.current) {
    seededFor.current = true;
    setDraft(selections);
  }
  if (!visible && seededFor.current) seededFor.current = false;

  const toggle = (groupKey: string, value: string): void => {
    setDraft(prev => {
      const cur = prev[groupKey] ?? [];
      const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
      return { ...prev, [groupKey]: next };
    });
  };

  const stagedCount = Object.values(draft).reduce((n, vals) => n + vals.length, 0);

  return (
    <Overlay
      visible={visible}
      onRequestClose={onClose}
      placement="bottom"
      closeAccessibilityLabel="Close filters"
    >
      <Pressable style={styles.sheet} onPress={() => undefined} accessible={false}>
        <View style={styles.header}>
          <TextX variant="title" accessibilityRole="header">
            Filters
          </TextX>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close filters"
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          >
            <Icon name="close" size={14} tone="muted" decorative />
          </Pressable>
        </View>
        <Hairline />

        <ScrollView contentContainerStyle={styles.body}>
          {groups.map(group => {
            const selected = draft[group.key] ?? [];
            return (
              <View key={group.key} style={styles.group}>
                <TextX variant="caption" tone="subtle" style={styles.groupLabel}>
                  {group.label}
                  {selected.length > 0 ? ` · ${selected.length}` : ''}
                </TextX>
                <View style={styles.chips}>
                  {group.options.map(opt => {
                    const active = selected.includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        accessibilityRole="button"
                        accessibilityLabel={`${group.label} ${opt.label ?? opt.value}`}
                        accessibilityState={{ selected: active }}
                        onPress={() => toggle(group.key, opt.value)}
                        style={({ pressed }) => [
                          styles.chip,
                          active && styles.chipActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        {opt.dotColor !== undefined ? (
                          <View style={[styles.dot, { backgroundColor: opt.dotColor }]} />
                        ) : null}
                        <TextX
                          variant="caption"
                          mono
                          style={[styles.chipText, active && styles.chipTextActive]}
                        >
                          {opt.label ?? opt.value}
                        </TextX>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            );
          })}
        </ScrollView>

        <Hairline />
        <View style={styles.footer}>
          <Button
            label={stagedCount > 0 ? `Clear (${stagedCount})` : 'Clear'}
            variant="ghost"
            onPress={() => {
              const cleared: FilterSelections = {};
              for (const g of groups) cleared[g.key] = [];
              setDraft(cleared);
              onClear();
            }}
          />
          <Button label="Apply" variant="primary" onPress={() => onApply(draft)} />
        </View>
      </Pressable>
    </Overlay>
  );
}

/**
 * The trigger that opens a {@link FilterSheet} — a compact pill showing the
 * number of active filters (highlighted when any are set).
 */
export function FilterButton({
  count,
  onPress,
}: {
  /** Number of active filters; shown as a badge and highlights the button. */
  readonly count: number;
  onPress(): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildButtonStyles(t), [t]);
  const active = count > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={active ? `Filters, ${count} active` : 'Filters'}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, active && styles.btnActive, pressed && styles.pressed]}
    >
      <TextX variant="caption" mono style={[styles.btnText, active && styles.btnTextActive]}>
        {active ? `Filter · ${count}` : 'Filter'}
      </TextX>
    </Pressable>
  );
}

function buildButtonStyles(t: Theme) {
  return StyleSheet.create({
    btn: {
      paddingHorizontal: t.spacing.md + 2,
      paddingVertical: t.spacing.sm + 2,
      borderRadius: t.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceSubtle,
      justifyContent: 'center',
    },
    btnActive: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    btnText: { fontSize: 12, fontWeight: '600', color: t.colors.textMuted },
    btnTextActive: { color: t.colors.accent },
    pressed: { opacity: 0.6 },
  });
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    sheet: {
      backgroundColor: t.colors.surfaceRaised,
      borderTopLeftRadius: t.radii.lg + 4,
      borderTopRightRadius: t.radii.lg + 4,
      maxHeight: '80%',
      paddingBottom: t.spacing.xxl,
      shadowColor: t.shadow.shadowColor,
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: t.mode === 'dark' ? 0.3 : 0.08,
      shadowRadius: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.lg,
    },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: t.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceSubtle,
    },
    body: { paddingHorizontal: t.spacing.xl, paddingVertical: t.spacing.lg, gap: t.spacing.xl },
    group: { gap: t.spacing.md },
    groupLabel: { textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: '700' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.xs + 2,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm + 1,
      borderRadius: t.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceSubtle,
    },
    chipActive: { backgroundColor: t.colors.accentSoft, borderColor: t.colors.accent },
    chipText: { fontSize: 12, fontWeight: '600', color: t.colors.textMuted },
    chipTextActive: { color: t.colors.accent },
    dot: { width: 6, height: 6, borderRadius: 3 },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: t.spacing.xl,
      paddingTop: t.spacing.lg,
    },
    pressed: { opacity: 0.6 },
  });
}
