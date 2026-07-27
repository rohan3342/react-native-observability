import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

export interface KeyValueRow {
  readonly key: string;
  readonly value: string;
}

/**
 * Renders a list of key → value rows with the key on its own line (accent,
 * uppercase-ish label) and the value wrapping freely beneath it in monospace.
 *
 * This replaces dumping a header map or a flat object as one `JSON.stringify`
 * blob: long values (e.g. a `report-to` / `nel` header, or a stringified array)
 * stay readable instead of becoming an unbroken wall of text, and each key is
 * independently scannable.
 *
 * Values are intentionally **not** `selectable`: inside the detail sheet's
 * `ScrollView`, a selectable `<Text>` captures the touch to begin iOS text
 * selection, so a drag starting on a value never reaches the scroll responder
 * (the section won't scroll). Each section already has a copy button, so
 * selection is redundant — dropping it restores scrolling.
 */
export function KeyValueRows({ rows }: { rows: readonly KeyValueRow[] }): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.list}>
      {rows.map((r, i) => (
        <View key={`${r.key}-${i}`} style={styles.row}>
          <TextX variant="caption" tone="accent" mono style={styles.key}>
            {r.key}
          </TextX>
          <TextX variant="body" mono style={styles.value}>
            {r.value}
          </TextX>
        </View>
      ))}
    </View>
  );
}

/** Build display rows from a header map, sorted by key for stable output. */
export function headerRows(headers: Record<string, string> | undefined): KeyValueRow[] {
  if (headers === undefined) return [];
  return Object.keys(headers)
    .sort()
    .map(key => ({ key, value: headers[key] ?? '' }));
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    list: { gap: t.spacing.md },
    row: { gap: 2 },
    key: { letterSpacing: 0.2 },
    value: { lineHeight: 18 },
  });
}
