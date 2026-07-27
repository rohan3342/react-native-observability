import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { Overlay } from './Overlay';
import { Hairline, TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';

export interface DetailSheetProps {
  readonly visible: boolean;
  readonly title: string;
  /** Right-aligned actions (Copy, Share, etc.). */
  readonly actions?: React.ReactNode;
  onClose(): void;
  readonly children: React.ReactNode;
}

/**
 * Bottom-sheet-style modal used by tabs to display an expanded entry's
 * details. Tap-scrim-to-dismiss; the modal handles `onRequestClose` for
 * Android back-button.
 */
export function DetailSheet({
  visible,
  title,
  actions,
  onClose,
  children,
}: DetailSheetProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <Overlay
      visible={visible}
      onRequestClose={onClose}
      placement="bottom"
      closeAccessibilityLabel="Close details"
    >
      {/* Tap-catcher: presses inside the sheet must not fall through to the
          scrim. `accessible={false}` keeps it out of the a11y tree without
          hiding its children. */}
      <Pressable style={styles.sheet} onPress={() => undefined} accessible={false}>
        <View style={styles.header}>
          <TextX variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {title}
          </TextX>
          <View style={styles.headerActions}>
            {actions}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close details"
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && pressedOverlay]}
            >
              <Icon name="close" size={14} tone="muted" decorative />
            </Pressable>
          </View>
        </View>
        <Hairline />
        <ScrollView contentContainerStyle={styles.body}>{children}</ScrollView>
      </Pressable>
    </Overlay>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    sheet: {
      backgroundColor: t.colors.surfaceRaised,
      borderTopLeftRadius: t.radii.lg + 4,
      borderTopRightRadius: t.radii.lg + 4,
      maxHeight: '85%',
      minHeight: '40%',
      paddingBottom: t.spacing.xxl,
      // A bottom-anchored sheet casts its lift UPWARD (the default downward
      // `t.shadow` is off-screen, leaving a hard top edge). Soft + light so the
      // top corners read as a raised sheet, not a boxed-in panel.
      shadowColor: t.shadow.shadowColor,
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: t.mode === 'dark' ? 0.3 : 0.08,
      shadowRadius: 10,
      elevation: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.xl,
      paddingVertical: t.spacing.lg,
      gap: t.spacing.md,
    },
    title: { flex: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm + 2 },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: t.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceSubtle,
    },
    body: { padding: t.spacing.xl, gap: t.spacing.lg },
  });
}
