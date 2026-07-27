import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

export interface TabToolbarProps {
  /**
   * Primary control row — usually a `Segmented` (Slices/Flags, Requests/Rules)
   * or a horizontally-scrolling chip row (log levels, status groups). Pinned at
   * the top of the toolbar.
   */
  readonly primary?: React.ReactNode;
  /**
   * When the {@link primary} content is a wide chip row that should scroll
   * horizontally rather than wrap (log levels, HTTP status groups). Default:
   * `false` (the primary row lays out as-is).
   */
  readonly primaryScrolls?: boolean;
  /**
   * Trailing accessory aligned to the end of the primary row — a refresh button,
   * a result count, an "Export all" action. Sits opposite {@link primary}.
   */
  readonly trailing?: React.ReactNode;
  /**
   * Search row — a `SearchInput` (it flexes to fill) plus an optional filter
   * button. Rendered on its own line under the primary row when present.
   */
  readonly search?: React.ReactNode;
  /** Optional filter trigger shown at the end of the search row. */
  readonly filter?: React.ReactNode;
  /**
   * Result-count / status line shown under the search row (e.g. "23 shown").
   * A string renders muted; pass a node for richer content.
   */
  readonly meta?: React.ReactNode;
}

/**
 * The shared sub-header every tab puts above its list. It standardises the
 * grammar the six tabs previously each re-implemented — a primary control row
 * (segmented / chips) with an optional trailing accessory, an optional search +
 * filter row, and an optional result-count line — so the toolbar height,
 * padding, and rhythm are identical across Logs, Network, State, Navigation,
 * Performance, and Settings.
 *
 * Everything is a slot: a tab passes only the pieces it needs. The toolbar adds
 * the consistent spacing between them.
 */
export function TabToolbar({
  primary,
  primaryScrolls = false,
  trailing,
  search,
  filter,
  meta,
}: TabToolbarProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);

  return (
    <View style={styles.root}>
      {primary !== undefined || trailing !== undefined ? (
        <View style={styles.primaryRow}>
          {primaryScrolls ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.primaryScroll}
              style={styles.primaryScroller}
            >
              {primary}
            </ScrollView>
          ) : (
            <View style={styles.primaryInline}>{primary}</View>
          )}
          {trailing !== undefined ? <View style={styles.trailing}>{trailing}</View> : null}
        </View>
      ) : null}

      {search !== undefined || filter !== undefined ? (
        <View style={styles.searchRow}>
          {search !== undefined ? <View style={styles.searchFill}>{search}</View> : null}
          {filter}
        </View>
      ) : null}

      {meta !== undefined ? (
        <View style={styles.metaRow}>
          {typeof meta === 'string' ? (
            <TextX variant="caption" tone="muted">
              {meta}
            </TextX>
          ) : (
            meta
          )}
        </View>
      ) : null}
    </View>
  );
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    root: { paddingTop: t.spacing.md },
    primaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      gap: t.spacing.md,
    },
    // Inline (non-scrolling) primary content (a Segmented, or wrapping chips).
    primaryInline: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: t.spacing.md,
    },
    primaryScroller: { flexGrow: 0, flexShrink: 1 },
    primaryScroll: { gap: t.spacing.md, alignItems: 'center', paddingRight: t.spacing.lg },
    trailing: { flexShrink: 0 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
    },
    searchFill: { flex: 1 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.xs,
    },
  });
}
