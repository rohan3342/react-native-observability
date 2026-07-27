/**
 * An editable list of key/value rows (e.g. HTTP headers). Provides add / remove
 * per row, with inline notes for blank or duplicate keys.
 *
 * Serializes to/from the existing `headersSet` string format used by
 * `RuleDraft` (`"Key: value"` per line) and the `headersRemove` comma list, so
 * the draft conversion helpers (`parseHeaderPatch`) are untouched.
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Button, TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';

export interface KVRow {
  readonly key: string;
  readonly value: string;
}

export interface KeyValueEditorProps {
  /** Current rows. */
  readonly rows: readonly KVRow[];
  onChange(rows: KVRow[]): void;
  /** Placeholder for the key column. */
  readonly keyPlaceholder?: string;
  /** Placeholder for the value column. */
  readonly valuePlaceholder?: string;
  /** Label on the "+ Add row" button. */
  readonly addLabel?: string;
}

// ─── Serialization helpers (mirror parseHeaderPatch format) ──────────────────

/** Convert a `"Key: value\n…"` set-string into rows. */
export function headersSetToRows(text: string): KVRow[] {
  return text
    .split('\n')
    .map(line => {
      const idx = line.indexOf(':');
      if (idx <= 0) return null;
      return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
    })
    .filter((r): r is KVRow => r !== null && r.key !== '');
}

/** Convert rows back into the `"Key: value\n…"` set-string. */
export function rowsToHeadersSet(rows: readonly KVRow[]): string {
  return rows
    .filter(r => r.key.trim() !== '')
    .map(r => `${r.key}: ${r.value}`)
    .join('\n');
}

/** Convert a comma-separated remove-string into a name array. */
export function headersRemoveToNames(text: string): string[] {
  return text
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '');
}

/** Convert a name array back into the comma-separated remove-string. */
export function namesToHeadersRemove(names: readonly string[]): string {
  return names.join(', ');
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Renders an editable list of `{ key, value }` rows. Serializes to/from the
 * `RuleDraft.headersSet` string so `draftToRule` stays untouched.
 */
export function KeyValueEditor({
  rows,
  onChange,
  keyPlaceholder = 'Header-Name',
  valuePlaceholder = 'value',
  addLabel = '+ Add header',
}: KeyValueEditorProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);

  // Track which keys appear more than once for duplicate warnings.
  const keyCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const k = r.key.trim().toLowerCase();
      if (k !== '') counts[k] = (counts[k] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const update = (index: number, field: 'key' | 'value', text: string) => {
    const next = rows.map((r, i) => (i === index ? { ...r, [field]: text } : r));
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...rows, { key: '', value: '' }]);
  };

  return (
    <View style={styles.container}>
      {rows.map((row, index) => {
        const keyTrimmed = row.key.trim().toLowerCase();
        const isDuplicate = keyTrimmed !== '' && (keyCounts[keyTrimmed] ?? 0) > 1;
        const isBlankKey = row.key.trim() === '' && row.value.trim() !== '';

        return (
          <View key={index} style={styles.rowGroup}>
            <View style={styles.inputRow}>
              <TextInput
                value={row.key}
                onChangeText={text => update(index, 'key', text)}
                placeholder={keyPlaceholder}
                placeholderTextColor={t.colors.textSubtle}
                accessibilityLabel={`Header key ${index + 1}`}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.keyInput]}
              />
              <TextInput
                value={row.value}
                onChangeText={text => update(index, 'value', text)}
                placeholder={valuePlaceholder}
                placeholderTextColor={t.colors.textSubtle}
                accessibilityLabel={`Header value ${index + 1}`}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, styles.valueInput]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove header row ${index + 1}`}
                onPress={() => remove(index)}
                hitSlop={t.hitSlop.loose}
                style={({ pressed }) => [styles.removeBtn, pressed && pressedOverlay]}
              >
                <Icon name="close" size="sm" tone="danger" decorative />
              </Pressable>
            </View>
            {isDuplicate ? (
              <TextX variant="caption" tone="warning" style={styles.note}>
                Duplicate key — only the last entry will be sent.
              </TextX>
            ) : null}
            {isBlankKey ? (
              <TextX variant="caption" tone="warning" style={styles.note}>
                Key is blank — this row will be ignored.
              </TextX>
            ) : null}
          </View>
        );
      })}

      <Button label={addLabel} variant="secondary" size="sm" onPress={add} style={styles.addBtn} />
    </View>
  );
}

/** An editable list of header-name chips for the "Remove headers" patch. */
export function RemoveHeadersEditor({
  names,
  onChange,
}: {
  readonly names: readonly string[];
  onChange(names: string[]): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);

  const addName = () => onChange([...names, '']);
  const updateName = (index: number, text: string) =>
    onChange(names.map((n, i) => (i === index ? text : n)));
  const removeName = (index: number) => onChange(names.filter((_, i) => i !== index));

  return (
    <View style={styles.container}>
      {names.map((name, index) => (
        <View key={index} style={styles.inputRow}>
          <TextInput
            value={name}
            onChangeText={text => updateName(index, text)}
            placeholder="header-name"
            placeholderTextColor={t.colors.textSubtle}
            accessibilityLabel={`Remove header ${index + 1}`}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { flex: 1 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove entry ${index + 1}`}
            onPress={() => removeName(index)}
            hitSlop={t.hitSlop.loose}
            style={({ pressed }) => [styles.removeBtn, pressed && pressedOverlay]}
          >
            <Icon name="close" size="sm" tone="danger" decorative />
          </Pressable>
        </View>
      ))}
      <Button
        label="+ Add header name"
        variant="secondary"
        size="sm"
        onPress={addName}
        style={styles.addBtn}
      />
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.6 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    container: { gap: t.spacing.sm },
    rowGroup: { gap: t.spacing.xs },
    inputRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radii.md,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm + 2,
      color: t.colors.text,
      backgroundColor: t.colors.surfaceSubtle,
      fontFamily: t.typography.mono,
      fontSize: t.typography.body.size,
    },
    keyInput: { flex: 2 },
    valueInput: { flex: 3 },
    removeBtn: { padding: t.spacing.sm },
    addBtn: { alignSelf: 'flex-start', marginTop: t.spacing.xs },
    note: { marginLeft: t.spacing.xs },
  });
}
