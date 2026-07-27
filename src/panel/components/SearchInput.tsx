import React, { useMemo } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';

export interface SearchInputProps {
  readonly value: string;
  onChange(text: string): void;
  readonly placeholder?: string;
}

/**
 * Search field shared by tabs. Plain `TextInput` — no debouncing because
 * the lists are already memoised, and a debounce would just add input lag.
 *
 * Renders a magnifier glyph on the left and, when there's any text, a
 * "Clear" text button on the right that resets the value.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
}: SearchInputProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const hasText = value.length > 0;
  return (
    <View style={styles.root}>
      <View style={styles.inputWrap}>
        <Icon name="search" size={16} tone="subtle" decorative />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel={placeholder}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {hasText ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => onChange('')}
            style={({ pressed }) => [styles.clear, pressed && pressedOverlay]}
            hitSlop={8}
          >
            <TextX variant="caption" tone="accent" weight="600">
              Clear
            </TextX>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.6 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    root: { paddingHorizontal: t.spacing.lg, paddingVertical: t.spacing.sm + 2 },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.colors.surfaceSubtle,
      borderRadius: t.radii.md + 2,
      paddingHorizontal: t.spacing.md + 2,
      gap: t.spacing.sm + 2,
    },
    input: {
      flex: 1,
      paddingVertical: t.spacing.md,
      fontSize: 14,
      color: t.colors.text,
    },
    clear: { paddingVertical: t.spacing.sm + 2, paddingLeft: t.spacing.sm },
  });
}
