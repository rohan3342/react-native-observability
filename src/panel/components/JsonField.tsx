/**
 * A mono multiline text editor for JSON / raw-text bodies. Provides:
 * - Inline validation: parses on change and shows a non-blocking note when the
 *   content is not valid JSON (matches parseBody's raw-text fallback — invalid
 *   JSON is allowed and sent as a string, not an error state).
 * - "Format" button: pretty-prints valid JSON. No-op on empty / non-JSON.
 * - "Valid JSON" confirmation note when the content parses successfully.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

export interface JsonFieldProps {
  readonly value: string;
  onChange(v: string): void;
  /** Placeholder shown when empty. */
  readonly placeholder?: string;
  /** Accessibility label forwarded to the TextInput. */
  readonly accessibilityLabel?: string;
}

type ParseState = 'empty' | 'valid' | 'raw-text';

function classify(raw: string): ParseState {
  const trimmed = raw.trim();
  if (trimmed === '') return 'empty';
  try {
    JSON.parse(trimmed);
    return 'valid';
  } catch {
    return 'raw-text';
  }
}

/**
 * Mono text area with JSON format + inline validation. Non-JSON content is
 * surfaced as an informational note ("will be sent as raw text") — the field
 * never blocks saving.
 */
export function JsonField({
  value,
  onChange,
  placeholder = '{ }',
  accessibilityLabel = 'Body',
}: JsonFieldProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [focused, setFocused] = useState(false);

  const state = classify(value);

  const format = useCallback(() => {
    if (state !== 'valid') return;
    try {
      const pretty = JSON.stringify(JSON.parse(value.trim()) as unknown, null, 2);
      onChange(pretty);
    } catch {
      // no-op — shouldn't reach here given classify returned 'valid'
    }
  }, [value, state, onChange]);

  return (
    <View style={styles.container}>
      <View style={[styles.editorWrapper, focused && styles.editorFocused]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          textAlignVertical="top"
          style={styles.input}
        />
        {state === 'valid' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Format JSON"
            onPress={format}
            style={({ pressed }) => [styles.formatBtn, pressed && pressedOverlay]}
          >
            <TextX variant="caption" tone="accent" style={styles.formatLabel}>
              Format
            </TextX>
          </Pressable>
        ) : null}
      </View>

      {state === 'valid' ? (
        <TextX variant="caption" tone="success" style={styles.note}>
          Valid JSON
        </TextX>
      ) : state === 'raw-text' ? (
        <TextX variant="caption" tone="muted" style={styles.note}>
          Not valid JSON — will be sent as raw text.
        </TextX>
      ) : null}
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    container: { gap: t.spacing.xs },
    editorWrapper: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radii.md,
      backgroundColor: t.colors.surfaceSubtle,
      overflow: 'hidden',
    },
    editorFocused: {
      borderColor: t.colors.accent,
    },
    input: {
      paddingHorizontal: t.spacing.md,
      paddingTop: t.spacing.sm + 2,
      paddingBottom: t.spacing.sm + 2,
      color: t.colors.text,
      fontFamily: t.typography.mono,
      fontSize: t.typography.body.size,
      lineHeight: t.typography.body.lineHeight,
      minHeight: 100,
    },
    formatBtn: {
      alignSelf: 'flex-end',
      paddingHorizontal: t.spacing.md,
      paddingBottom: t.spacing.sm,
    },
    formatLabel: {
      fontWeight: '600',
    },
    note: {
      marginLeft: t.spacing.xs,
    },
  });
}
