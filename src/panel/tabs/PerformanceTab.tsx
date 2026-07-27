import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { getPerfStore } from '../../integrations/perf';
import type { PerfSpan } from '../../integrations/perf';
import type { NetworkLogEntry } from '../../integrations/http';
import { DetailSheet } from '../components/DetailSheet';
import { EmptyState } from '../components/EmptyState';
import { MethodBadge } from '../components/MethodBadge';
import { Segmented } from '../components/Segmented';
import { VirtualList } from '../components/VirtualList';
import { TabScaffold, TabToolbar } from '../templates';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import { usePersistentState } from '../PanelPrefs';
import { useDebugPanel } from '../useDebugPanel';
import { aggregateEndpoints, type EndpointStat } from './networkPerf';
import { formatRelativeTime } from '../util/time';

type ViewMode = 'endpoints' | 'spans';

/**
 * Performance tab. A {@link Segmented} toggle switches between two read-only
 * views, both derived from data the panel already collects (no new capture):
 *  - **Endpoints** — per-endpoint latency (p50/p95/max) + error rate, aggregated
 *    over the network source via {@link aggregateEndpoints}.
 *  - **Spans** — `trackPerformance()` measurements from the perf store.
 *
 * Opt-in tab — list `'performance'` in `DebugPanelProvider.tabs` to show it.
 */
export const PerformanceTab = React.memo(function PerformanceTab(): React.ReactElement {
  const { networkSource } = useDebugPanel();
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [view, setView] = usePersistentState<ViewMode>('performance.view', 'endpoints');
  const [legendOpen, setLegendOpen] = useState(false);

  const netEntries = useSyncExternalStore(
    networkSource !== null ? networkSource.subscribe : noopSubscribe,
    networkSource !== null ? networkSource.getSnapshot : emptyNet
  );
  const perfStore = useMemo(() => getPerfStore(), []);
  const spans = useSyncExternalStore(perfStore.subscribe, perfStore.getSnapshot);

  const endpoints = useMemo(() => aggregateEndpoints(netEntries), [netEntries]);
  // Slowest p95 — latency bars are drawn relative to it.
  const maxP95 = useMemo(() => endpoints.reduce((m, e) => Math.max(m, e.p95), 1), [endpoints]);
  const totalRequests = useMemo(() => endpoints.reduce((n, e) => n + e.count, 0), [endpoints]);
  // Newest-first; memoised so the FlatList data reference is stable per change.
  const reversedSpans = useMemo(() => spans.slice().reverse(), [spans]);

  return (
    <TabScaffold
      toolbar={
        <TabToolbar
          primary={
            <Segmented<ViewMode>
              accessibilityLabel="Performance view"
              value={view}
              onChange={setView}
              options={[
                { value: 'endpoints', label: 'Endpoints', count: endpoints.length },
                { value: 'spans', label: 'Spans', count: spans.length },
              ]}
            />
          }
          trailing={
            view === 'spans' && spans.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear spans"
                accessibilityHint="Removes all recorded performance spans"
                hitSlop={t.hitSlop.default}
                onPress={() => perfStore.clear()}
                style={({ pressed }) => [styles.clearBtn, pressed && pressedOverlay]}
              >
                <TextX variant="caption" tone="accent">
                  Clear
                </TextX>
              </Pressable>
            ) : undefined
          }
        />
      }
    >
      {view === 'endpoints' ? (
        <>
          <VirtualList<EndpointStat>
            data={endpoints}
            keyExtractor={s => s.endpoint}
            renderItem={({ item }) => <EndpointRow stat={item} maxP95={maxP95} />}
            ListHeaderComponent={
              endpoints.length > 0 ? (
                <EndpointsHeader
                  routeCount={endpoints.length}
                  totalRequests={totalRequests}
                  onInfoPress={() => setLegendOpen(true)}
                />
              ) : null
            }
            ListEmptyComponent={
              <EmptyState
                icon="network"
                title="No completed requests"
                hint="Per-endpoint latency (p50/p95/max) and error rate appear here once requests complete."
              />
            }
          />
          <MetricLegendSheet visible={legendOpen} onClose={() => setLegendOpen(false)} />
        </>
      ) : (
        <VirtualList<PerfSpan>
          data={reversedSpans}
          keyExtractor={(sp, i) => `${sp.startedAt}-${i}`}
          renderItem={({ item }) => <SpanRow span={item} />}
          ListEmptyComponent={
            <EmptyState
              icon="clock"
              title="No spans recorded"
              hint="Call trackPerformance('name', { logger }).end() to measure arbitrary work; results show here."
            />
          }
        />
      )}
    </TabScaffold>
  );
});

const METRIC_DEFS = [
  { key: 'n', label: 'n', description: 'Total number of requests made to this endpoint.' },
  {
    key: 'p50',
    label: 'p50',
    description: 'Median (50th percentile) response time — how fast a typical request was.',
  },
  {
    key: 'p95',
    label: 'p95',
    description: '95th-percentile response time — the threshold below which 95% of requests fall.',
  },
  { key: 'max', label: 'max', description: 'Slowest individual request ever recorded.' },
  {
    key: 'err',
    label: 'err',
    description: 'Percentage of requests that returned a non-2xx HTTP status.',
  },
] as const;

function EndpointsHeader({
  routeCount,
  totalRequests,
  onInfoPress,
}: {
  routeCount: number;
  totalRequests: number;
  onInfoPress: () => void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.sectionGroup}>
      {/* Section title row: label · counts · ⓘ */}
      <View style={styles.headerRow}>
        <TextX variant="caption" tone="muted" style={styles.sectionTitle}>
          HTTP ENDPOINTS
        </TextX>
        <View style={styles.headerMeta}>
          <TextX variant="caption" tone="muted">
            {routeCount} routes · {totalRequests} req
          </TextX>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Metric definitions"
            accessibilityHint="Shows an explanation of each metric column"
            hitSlop={t.hitSlop.default}
            onPress={onInfoPress}
            style={({ pressed }) => [styles.infoBtn, pressed && { opacity: 0.5 }]}
          >
            <Icon name="info" size={15} tone="accent" decorative />
          </Pressable>
        </View>
      </View>
      {/* Column label strip — aligns with value cells in EndpointRow */}
      <View style={styles.columnHeader}>
        <View style={styles.columnSpacer} />
        {METRIC_DEFS.map(m => (
          <TextX key={m.key} variant="caption" tone="subtle" style={styles.columnLabel}>
            {m.label}
          </TextX>
        ))}
      </View>
    </View>
  );
}

function EndpointRow({ stat, maxP95 }: { stat: EndpointStat; maxP95: number }): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const errPct = Math.round(stat.errorRate * 100);
  const errColor =
    errPct === 0 ? t.colors.textMuted : errPct < 25 ? t.colors.warning : t.colors.danger;
  // p95 bar relative to the slowest endpoint; tinted by latency.
  const frac = Math.max(0.02, Math.min(1, stat.p95 / maxP95));
  const barColor =
    stat.p95 > 1000 ? t.colors.danger : stat.p95 > 300 ? t.colors.warning : t.colors.success;
  return (
    <View style={styles.card}>
      <View style={styles.endpointTitle}>
        <MethodBadge method={stat.method} />
        <TextX variant="body" mono numberOfLines={1} style={styles.endpointPath}>
          {stat.path}
        </TextX>
      </View>
      {/* p95 latency bar */}
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${frac * 100}%`, backgroundColor: barColor }]} />
      </View>
      {/* Values only — labels are shown once in the column header above */}
      <View style={styles.metricsRow}>
        <MetricValue value={String(stat.count)} />
        <MetricValue value={`${stat.p50}ms`} />
        <MetricValue value={`${stat.p95}ms`} />
        <MetricValue value={`${stat.max}ms`} />
        <MetricValue value={`${errPct}%`} color={errColor} />
      </View>
    </View>
  );
}

function MetricValue({ value, color }: { value: string; color?: string }): React.ReactElement {
  return (
    <TextX
      variant="body"
      mono
      style={[styles.metricValue, color !== undefined ? { color } : undefined]}
    >
      {value}
    </TextX>
  );
}

const styles = StyleSheet.create({
  metricValue: { minWidth: 44, textAlign: 'right' },
});

function MetricLegendSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}): React.ReactElement {
  return (
    <DetailSheet visible={visible} title="Metric definitions" onClose={onClose}>
      {METRIC_DEFS.map((m, i) => (
        <LegendRow
          key={m.key}
          label={m.label}
          description={m.description}
          last={i === METRIC_DEFS.length - 1}
        />
      ))}
    </DetailSheet>
  );
}

function LegendRow({
  label,
  description,
  last,
}: {
  label: string;
  description: string;
  last: boolean;
}): React.ReactElement {
  const t = useTheme();
  const s = useMemo(() => buildLegendRowStyles(t, last), [t, last]);
  return (
    <View style={s.row}>
      <TextX variant="body" mono tone="accent" style={s.label}>
        {label}
      </TextX>
      <TextX variant="body" tone="muted" style={s.desc}>
        {description}
      </TextX>
    </View>
  );
}

function buildLegendRowStyles(t: Theme, last: boolean) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.spacing.md,
      paddingBottom: last ? 0 : t.spacing.md,
      borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    label: { width: 36 },
    desc: { flex: 1 },
  });
}

function SpanRow({ span }: { span: PerfSpan }): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.card}>
      <View style={styles.spanHead}>
        <TextX variant="body" numberOfLines={1} style={styles.spanName}>
          {span.name}
        </TextX>
        <TextX variant="body" mono tone="accent">
          {span.durationMs}ms
        </TextX>
      </View>
      <TextX variant="caption" tone="muted">
        {formatRelativeTime(span.startedAt)}
      </TextX>
    </View>
  );
}

function noopSubscribe(): () => void {
  return () => undefined;
}
const EMPTY_NET: readonly NetworkLogEntry[] = [];
function emptyNet(): readonly NetworkLogEntry[] {
  return EMPTY_NET;
}

const pressedOverlay = { opacity: 0.6 } as const;

function buildStyles(t: Theme) {
  return StyleSheet.create({
    clearBtn: { paddingHorizontal: t.spacing.sm, paddingVertical: t.spacing.xs },
    // Groups the section title row + column header strip together above the list.
    // paddingHorizontal matches the card's internal padding so everything is flush.
    sectionGroup: {
      gap: t.spacing.xs,
      marginBottom: t.spacing.xs,
      paddingHorizontal: t.spacing.md,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: { textTransform: 'uppercase', letterSpacing: 0.6 },
    headerMeta: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    infoBtn: { padding: 2 },
    // Column label strip — inherits horizontal padding from sectionGroup.
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    columnSpacer: { flex: 1 },
    columnLabel: { minWidth: 44, textAlign: 'right' },
    card: {
      gap: t.spacing.sm,
      padding: t.spacing.md,
      borderRadius: t.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceSubtle,
    },
    endpointTitle: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    endpointPath: { flex: 1 },
    barTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: t.colors.surfaceMuted,
      overflow: 'hidden',
    },
    barFill: { height: 4, borderRadius: 2 },
    // Values-only row — no labels; flex spacer pushes columns right to mirror the header strip.
    metricsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    spanHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: t.spacing.md,
    },
    spanName: { flex: 1 },
  });
}
