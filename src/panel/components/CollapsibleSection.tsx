import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import { AnimatedChevron } from './AnimatedChevron';

export interface CollapsibleSectionProps {
  /** Section heading, e.g. "Request Headers". */
  readonly label: string;
  /**
   * Monospace body text shown when expanded. Ignored when `children` is
   * provided. Optional so a section can render structured `children` instead.
   */
  readonly value?: string;
  /**
   * Custom expanded body. When provided, rendered instead of the monospace
   * `value` — e.g. a {@link KeyValueRows} list for headers.
   */
  readonly children?: React.ReactNode;
  /** Optional count shown next to the label, e.g. number of header rows. */
  readonly count?: number | undefined;
  /** Start expanded. Default: `false`. */
  readonly defaultExpanded?: boolean;
  /**
   * Optional copy handler. When provided, a small copy affordance renders in
   * the section header and invokes this (typically opening the share sheet).
   */
  readonly onCopy?: () => void;
}

/**
 * A disclosure section used by the Network detail sheet: a tappable header that
 * toggles a monospace body, with an optional per-section copy button. Lets a
 * large request/response payload stay collapsed until the user wants it, and
 * makes each part independently copyable.
 */
export function CollapsibleSection({
  label,
  value,
  children,
  count,
  defaultExpanded = false,
  onCopy,
}: CollapsibleSectionProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.headerMain, pressed && pressedOverlay]}
          onPress={() => setExpanded(e => !e)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${label}, ${expanded ? 'expanded' : 'collapsed'}`}
        >
          <AnimatedChevron expanded={expanded} style={styles.caret} />
          <TextX variant="caption" tone="muted" style={styles.label}>
            {label}
          </TextX>
          {count !== undefined ? (
            <TextX variant="caption" tone="subtle" style={styles.count}>
              {count}
            </TextX>
          ) : null}
        </Pressable>
        {onCopy !== undefined ? (
          <Pressable
            onPress={onCopy}
            accessibilityRole="button"
            accessibilityLabel={`Copy ${label}`}
            style={({ pressed }) => [styles.copyBtn, pressed && pressedOverlay]}
          >
            <Icon name="copy" size={16} tone="accent" decorative />
          </Pressable>
        ) : null}
      </View>
      {expanded ? (
        <View style={styles.body}>
          {children !== undefined ? (
            children
          ) : (
            <TextX variant="body" mono>
              {value}
            </TextX>
          )}
        </View>
      ) : null}
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.6 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    card: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radii.md,
      backgroundColor: t.colors.surfaceSubtle,
      overflow: 'hidden',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.md,
    },
    caret: { width: 12 },
    label: { textTransform: 'uppercase', letterSpacing: 0.5 },
    count: { fontVariant: ['tabular-nums'] },
    copyBtn: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: {
      paddingHorizontal: t.spacing.md,
      paddingBottom: t.spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      paddingTop: t.spacing.sm,
    },
  });
}
