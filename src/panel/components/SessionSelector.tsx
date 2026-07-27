import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { getSessions } from '../../storage';
import type { SessionMeta } from '../../storage';
import { Overlay } from './Overlay';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import { useDebugPanel } from '../useDebugPanel';

/**
 * Format a session into the full label shown in the dropdown rows.
 * `12:30:42 — v1.0.0 (45s)`
 */
function formatLabel(s: SessionMeta): string {
  const date = new Date(s.startTime).toLocaleTimeString();
  const duration =
    s.endTime !== undefined ? `${Math.round((s.endTime - s.startTime) / 1000)}s` : 'ongoing';
  return `${date} — v${s.appVersion} (${duration})`;
}

/**
 * Compact label for the header button — just the time + live/ended state, so it
 * doesn't crowd the branding title. The full detail lives in the dropdown rows.
 * `12:30:42 · live`
 */
function formatButtonLabel(s: SessionMeta): string {
  const date = new Date(s.startTime).toLocaleTimeString();
  return `${date} · ${s.endTime !== undefined ? 'ended' : 'live'}`;
}

/**
 * The header button that opens the session picker. Rendered inside the panel's
 * header row. Hidden when no sessions are persisted (i.e. `SessionManager` was
 * never initialised) — there's nothing to switch between.
 *
 * **Why split from the overlay:** the picker is a full-screen `Overlay`, which
 * fills its nearest positioned ancestor. If it rendered here (inside the small
 * header row) it would be clipped to the header box. So the button lives here and
 * {@link SessionPickerOverlay} is rendered at the panel root.
 */
export function SessionSelectorButton({ onOpen }: { onOpen(): void }): React.ReactElement | null {
  const { selectedSessionId } = useDebugPanel();
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const sessions = getSessions();

  if (sessions.length === 0) return null;

  const activeId = selectedSessionId ?? sessions[0]?.sessionId;
  const active = sessions.find(s => s.sessionId === activeId);
  const buttonLabel = active !== undefined ? formatButtonLabel(active) : 'Session';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Select session"
      onPress={onOpen}
      style={({ pressed }) => [styles.button, pressed && pressedOverlay]}
    >
      <View style={styles.buttonInner}>
        <TextX variant="caption" numberOfLines={1} style={styles.buttonLabel}>
          {buttonLabel}
        </TextX>
        <Icon name="chevron-down" size={11} tone="muted" decorative />
      </View>
    </Pressable>
  );
}

/**
 * The session-picker bottom sheet. Rendered at the **panel root** (not the
 * header) so its full-screen `Overlay` isn't clipped. Driven by `open`/`onClose`
 * lifted into `DebugPanel`, paired with {@link SessionSelectorButton}.
 */
export function SessionPickerOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose(): void;
}): React.ReactElement {
  const { selectedSessionId, setSelectedSessionId } = useDebugPanel();
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const sessions = getSessions();
  const activeId = selectedSessionId ?? sessions[0]?.sessionId;

  return (
    <Overlay
      visible={open}
      onRequestClose={onClose}
      placement="bottom"
      closeAccessibilityLabel="Close session picker"
    >
      <Pressable style={styles.sheet} onPress={() => undefined} accessible={false}>
        <TextX variant="title" style={styles.sheetTitle}>
          Sessions
        </TextX>
        <ScrollView style={styles.scroll}>
          {sessions.map((s, idx) => (
            <Pressable
              key={s.sessionId}
              accessibilityRole="button"
              accessibilityLabel={`Switch to session ${formatLabel(s)}`}
              onPress={() => {
                setSelectedSessionId(idx === 0 ? undefined : s.sessionId);
                onClose();
              }}
              style={[styles.row, s.sessionId === activeId && styles.rowActive]}
            >
              <TextX variant="body" style={styles.rowLabel} numberOfLines={1}>
                {formatLabel(s)}
              </TextX>
              <View style={styles.badges}>
                {idx === 0 ? <Badge label="LIVE" color={t.colors.success} /> : null}
                {s.crashed === true ? <Badge label="CRASHED" color={t.colors.danger} /> : null}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </Pressable>
    </Overlay>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: t.spacing.md - 2,
        paddingVertical: t.spacing.xs,
        borderRadius: t.radii.sm,
        backgroundColor: color,
      }}
    >
      <TextX
        style={{ color: t.colors.textInverse, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 }}
      >
        {label}
      </TextX>
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    button: {
      paddingHorizontal: t.spacing.md + 2,
      paddingVertical: t.spacing.sm + 2,
      borderRadius: t.radii.md,
      backgroundColor: t.colors.surfaceSubtle,
      maxWidth: 150,
    },
    buttonInner: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
    buttonLabel: { flexShrink: 1 },
    sheet: {
      backgroundColor: t.colors.surfaceRaised,
      borderTopLeftRadius: t.radii.lg + 4,
      borderTopRightRadius: t.radii.lg + 4,
      padding: t.spacing.lg,
      paddingBottom: t.spacing.xxl,
      maxHeight: '70%',
      // Bottom-anchored: lift the shadow upward so the top edge reads as raised.
      shadowColor: t.shadow.shadowColor,
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: t.mode === 'dark' ? 0.3 : 0.08,
      shadowRadius: 10,
    },
    scroll: { flexGrow: 0 },
    sheetTitle: { marginBottom: t.spacing.md },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md + 2,
      paddingHorizontal: t.spacing.md,
      borderRadius: t.radii.md,
      gap: t.spacing.md,
    },
    rowActive: { backgroundColor: t.colors.surfaceSubtle },
    rowLabel: { flex: 1 },
    badges: { flexDirection: 'row', gap: t.spacing.sm },
  });
}
