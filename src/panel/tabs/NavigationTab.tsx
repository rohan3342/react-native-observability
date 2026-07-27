import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { FlatList, View } from 'react-native';
import type { ListRenderItem } from 'react-native';
import type { ScreenLifecycleEvent, ScreenSummary } from '../../integrations/screen';
import { DetailSheet } from '../components/DetailSheet';
import { EmptyState } from '../components/EmptyState';
import { ListRow, Badge } from '../components/ListRow';
import { Segmented } from '../components/Segmented';
import { TabScaffold, TabToolbar } from '../templates';
import { TextX, useTheme } from '../theme';
import { useDebugPanel } from '../useDebugPanel';

type ViewMode = 'summary' | 'history';

export const NavigationTab = React.memo(function NavigationTab(): React.ReactElement {
  const { screenSource } = useDebugPanel();

  const events = useSyncExternalStore(
    screenSource !== null ? screenSource.subscribe : noopSubscribe,
    screenSource !== null ? screenSource.getSnapshot : emptySnapshot
  );

  const [view, setView] = useState<ViewMode>('summary');
  const [selectedEvent, setSelectedEvent] = useState<ScreenLifecycleEvent | null>(null);

  const summaries = useMemo(
    () => (screenSource !== null ? screenSource.getSummaries() : []),
    [screenSource, events]
  );

  if (screenSource === null) {
    return (
      <EmptyState
        title="No screen source configured"
        hint="Pass `screenSource={getScreenStore()}` to <DebugPanelProvider>, or call `trackScreen()` in your screens."
      />
    );
  }

  return (
    <TabScaffold
      toolbar={
        <TabToolbar
          primary={
            <Segmented<ViewMode>
              accessibilityLabel="Navigation view"
              value={view}
              onChange={setView}
              options={[
                { value: 'summary', label: 'Summary', count: summaries.length },
                { value: 'history', label: 'History', count: events.length },
              ]}
            />
          }
        />
      }
    >
      {view === 'summary' ? (
        <SummaryView summaries={summaries} />
      ) : (
        <HistoryView events={events} onSelect={setSelectedEvent} />
      )}

      <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </TabScaffold>
  );
});

// ─── Summary view ─────────────────────────────────────────────────────────

function SummaryView({ summaries }: { summaries: readonly ScreenSummary[] }): React.ReactElement {
  const sorted = useMemo(() => {
    return [...summaries].sort((a, b) => {
      if (a.currentlyMounted !== b.currentlyMounted) {
        return a.currentlyMounted ? -1 : 1;
      }
      return (b.lastMountedAt ?? 0) - (a.lastMountedAt ?? 0);
    });
  }, [summaries]);

  if (summaries.length === 0) {
    return (
      <EmptyState
        title="No screens tracked yet"
        hint="Call trackScreen() or use the React Navigation observer to populate this view."
      />
    );
  }

  return (
    <FlatList
      data={sorted}
      keyExtractor={summaryKey}
      renderItem={renderSummary}
      initialNumToRender={20}
      windowSize={5}
      removeClippedSubviews
      accessibilityRole="list"
    />
  );
}

function summaryKey(s: ScreenSummary): string {
  return s.screen;
}

function renderSummary({ item }: { item: ScreenSummary }): React.ReactElement {
  return <SummaryRow summary={item} />;
}

const SummaryRow = React.memo(function SummaryRow({
  summary,
}: {
  summary: ScreenSummary;
}): React.ReactElement {
  const t = useTheme();
  return (
    <ListRow
      accessibilityLabel={`${summary.screen}, mounted ${summary.mountCount} times, total ${summary.totalTimeMs} milliseconds${
        summary.currentlyMounted ? ', currently mounted' : ''
      }`}
      title={
        <TextX variant="body" weight="600" numberOfLines={1}>
          {summary.screen}
        </TextX>
      }
      subtitle={`${summary.mountCount} mount${summary.mountCount === 1 ? '' : 's'} · ${formatDuration(
        summary.totalTimeMs
      )}`}
      trailing={
        summary.currentlyMounted ? (
          <Badge label="LIVE" color={t.colors.success} filled />
        ) : undefined
      }
    />
  );
});

// ─── History view ─────────────────────────────────────────────────────────

function HistoryView({
  events,
  onSelect,
}: {
  events: readonly ScreenLifecycleEvent[];
  onSelect: (e: ScreenLifecycleEvent) => void;
}): React.ReactElement {
  const reversed = useMemo(() => events.slice().reverse(), [events]);

  // Stable renderItem so React.memo on HistoryRow holds. `onSelect` is the
  // parent's stable `setSelectedEvent` setter.
  const renderHistory = useCallback<ListRenderItem<ScreenLifecycleEvent>>(
    ({ item }) => <HistoryRow event={item} onSelect={onSelect} />,
    [onSelect]
  );

  if (events.length === 0) {
    return (
      <EmptyState
        title="No navigation events yet"
        hint="Screen mount/unmount events will appear here as they happen."
      />
    );
  }

  return (
    <FlatList
      data={reversed}
      keyExtractor={historyKey}
      renderItem={renderHistory}
      initialNumToRender={20}
      windowSize={5}
      removeClippedSubviews
      accessibilityRole="list"
    />
  );
}

function historyKey(e: ScreenLifecycleEvent, idx: number): string {
  return `${e.screen}:${e.event}:${e.timestamp}:${idx}`;
}

const HistoryRow = React.memo(function HistoryRow({
  event,
  onSelect,
}: {
  event: ScreenLifecycleEvent;
  onSelect(event: ScreenLifecycleEvent): void;
}): React.ReactElement {
  const t = useTheme();
  const handlePress = useCallback(() => onSelect(event), [onSelect, event]);
  const isMount = event.event === 'mount';
  return (
    <ListRow
      onPress={handlePress}
      accessibilityLabel={`${event.event} ${event.screen} at ${new Date(event.timestamp).toLocaleTimeString()}`}
      leading={
        <Badge
          label={isMount ? 'MOUNT' : 'UNMOUNT'}
          color={isMount ? t.colors.success : t.colors.textMuted}
        />
      }
      title={
        <TextX variant="body" weight="600" numberOfLines={1}>
          {event.screen}
        </TextX>
      }
      subtitle={`${new Date(event.timestamp).toLocaleTimeString()}${
        event.sessionId !== undefined ? ` · ${event.sessionId.slice(0, 8)}` : ''
      }`}
    />
  );
});

// ─── Detail sheet ─────────────────────────────────────────────────────────

function EventDetail({
  event,
  onClose,
}: {
  event: ScreenLifecycleEvent | null;
  onClose(): void;
}): React.ReactElement {
  const visible = event !== null;
  return (
    <DetailSheet
      visible={visible}
      title={event !== null ? `${event.event.toUpperCase()} · ${event.screen}` : ''}
      onClose={onClose}
    >
      {event !== null ? (
        <>
          <Section label="Screen" value={event.screen} />
          <Section label="Event" value={event.event} />
          <Section label="Timestamp" value={new Date(event.timestamp).toISOString()} />
          {event.sessionId !== undefined ? (
            <Section label="Session" value={event.sessionId} />
          ) : null}
          {event.params !== undefined ? (
            <Section label="Params" value={JSON.stringify(event.params, null, 2)} mono />
          ) : null}
        </>
      ) : null}
    </DetailSheet>
  );
}

function Section({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <TextX variant="caption" tone="muted" style={{ textTransform: 'uppercase' }}>
        {label}
      </TextX>
      <TextX variant="body" mono={mono} selectable>
        {value}
      </TextX>
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function noopSubscribe(): () => void {
  return () => undefined;
}
const EMPTY: readonly ScreenLifecycleEvent[] = [];
function emptySnapshot(): readonly ScreenLifecycleEvent[] {
  return EMPTY;
}
