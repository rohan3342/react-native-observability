/**
 * Shared display components used across the four Settings sub-views.
 * All components are pure renderers — no local state, no side effects.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { SessionMeta } from '../../../storage';
import type { Breadcrumb, BreadcrumbLevel } from '../../../integrations/breadcrumbs';
import { Surface, TextX, useTheme } from '../../theme';
import type { Theme } from '../../theme';
import type { HealthStatus } from './health';

// ─── Section ──────────────────────────────────────────────────────────────────

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Surface bordered radius="md" padding="lg" style={{ gap: t.spacing.md }}>
      <TextX
        variant="label"
        tone="muted"
        accessibilityRole="header"
        style={{ textTransform: 'uppercase' }}
      >
        {title}
      </TextX>
      {children}
    </Surface>
  );
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

export function InfoRow({ label, value }: { label: string; value: string }): React.ReactElement {
  const t = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: t.spacing.md,
      }}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <TextX variant="body" tone="muted">
        {label}
      </TextX>
      <TextX
        mono
        variant="body"
        numberOfLines={1}
        selectable
        style={{ flex: 1, textAlign: 'right' }}
      >
        {value}
      </TextX>
    </View>
  );
}

// ─── HealthStatusRow ──────────────────────────────────────────────────────────

/** The headline health verdict — a coloured badge + one-line plain-English status. */
export function HealthStatusRow({ status }: { status: HealthStatus }): React.ReactElement {
  const t = useTheme();
  const { color, label, hint } =
    status === 'panic'
      ? {
          color: t.colors.danger,
          label: 'PANIC',
          hint: 'Remote delivery paused after repeated failures.',
        }
      : status === 'degraded'
        ? {
            color: t.colors.warning,
            label: 'DEGRADED',
            hint: 'Some entries were dropped or failed to deliver.',
          }
        : {
            color: t.colors.success,
            label: 'HEALTHY',
            hint: 'Logs and telemetry are being delivered.',
          };
  return (
    <View
      style={{ gap: t.spacing.xs }}
      accessibilityRole="text"
      accessibilityLabel={`Health: ${label}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
        <View
          style={{
            paddingHorizontal: t.spacing.sm + 2,
            paddingVertical: 2,
            borderRadius: t.radii.sm,
            backgroundColor: color,
          }}
        >
          <TextX mono style={{ fontSize: 11, fontWeight: '700', color: t.colors.textInverse }}>
            {label}
          </TextX>
        </View>
        <TextX variant="caption" tone="muted" style={{ flex: 1 }}>
          {hint}
        </TextX>
      </View>
    </View>
  );
}

// ─── BreadcrumbRow ────────────────────────────────────────────────────────────

const CRUMB_GLYPH: Record<Breadcrumb['kind'], string> = {
  log: '•',
  network: '↦',
  navigation: '⤳',
  custom: '◆',
};

function crumbLevelColor(t: Theme, level: BreadcrumbLevel): string {
  switch (level) {
    case 'error':
      return t.colors.danger;
    case 'warning':
      return t.colors.warning;
    case 'debug':
      return t.colors.textSubtle;
    default:
      return t.colors.textMuted;
  }
}

/** One breadcrumb in the Timeline — glyph by kind, message, kind·time meta. */
export function BreadcrumbRow({ crumb }: { crumb: Breadcrumb }): React.ReactElement {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' }}
      accessibilityRole="text"
      accessibilityLabel={`${crumb.kind}: ${crumb.message}`}
    >
      <TextX mono style={{ color: crumbLevelColor(t, crumb.level), width: 14 }}>
        {CRUMB_GLYPH[crumb.kind]}
      </TextX>
      <View style={{ flex: 1 }}>
        <TextX variant="caption" mono numberOfLines={2}>
          {crumb.message}
        </TextX>
        <TextX variant="caption" tone="subtle">
          {crumb.category !== undefined ? `${crumb.category} · ` : ''}
          {new Date(crumb.timestamp).toLocaleTimeString()}
        </TextX>
      </View>
    </View>
  );
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

/**
 * One row in the Session health list — session id (shortened), crash status,
 * and start time. The current (live) session is always crash-free by definition.
 */
export function SessionRow({
  session,
  isCurrent,
}: {
  session: SessionMeta;
  isCurrent: boolean;
}): React.ReactElement {
  const t = useTheme();
  const crashed = session.crashed === true;
  const shortId =
    session.sessionId.length > 12 ? `${session.sessionId.slice(0, 12)}…` : session.sessionId;
  const status = isCurrent ? '● live' : crashed ? '⚠ crashed' : '✓ clean';
  const started = new Date(session.startTime).toLocaleString();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: t.spacing.md,
      }}
      accessibilityRole="text"
      accessibilityLabel={`Session ${session.sessionId}: ${isCurrent ? 'live' : crashed ? 'crashed' : 'clean'}, started ${started}`}
    >
      <TextX
        variant="caption"
        mono
        numberOfLines={1}
        style={{ color: crashed ? t.colors.danger : t.colors.textMuted }}
      >
        {status}
      </TextX>
      <TextX
        variant="caption"
        tone="muted"
        mono
        numberOfLines={1}
        style={{ flex: 1, textAlign: 'right' }}
      >
        {shortId}
      </TextX>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

export function buildStyles(t: Theme) {
  return StyleSheet.create({
    body: { padding: t.spacing.lg, gap: t.spacing.lg + 2 },
    modeRow: { flexDirection: 'row', gap: t.spacing.sm + 2 },
    crashBanner: {
      gap: t.spacing.sm,
      padding: t.spacing.md,
      borderRadius: t.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.danger,
      backgroundColor: t.colors.tint.error,
    },
    crashBannerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  });
}
