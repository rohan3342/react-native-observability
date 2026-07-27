import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, StyleSheet, View } from 'react-native';
import { LogLevel } from '../../logger/types';
import type { LogEntry } from '../../logger/types';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { DetailSheet } from '../components/DetailSheet';
import { EmptyState } from '../components/EmptyState';
import { ReadOnlyBanner } from '../components/ReadOnlyBanner';
import { FilterChip } from '../components/FilterChip';
import { Highlight } from '../components/Highlight';
import { JsonTree } from '../components/JsonTree';
import { ListRow, Badge } from '../components/ListRow';
import { FilterSheet, FilterButton } from '../components/FilterSheet';
import type { FilterGroup } from '../components/FilterSheet';
import { SearchInput } from '../components/SearchInput';
import { TabScaffold, TabToolbar } from '../templates';
import { Button, TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { usePersistentState } from '../PanelPrefs';
import { useCopy } from '../util/copy';
import { formatRelativeTime } from '../util/time';
import { useDebugPanel } from '../useDebugPanel';

// ─── Helpers ──────────────────────────────────────────────────────────────

const ALL_LEVELS_KEY = 'all';
const LEVELS: ReadonlyArray<{ key: number | 'all'; label: string }> = [
  { key: ALL_LEVELS_KEY, label: 'All' },
  { key: LogLevel.DEBUG, label: 'Debug' },
  { key: LogLevel.INFO, label: 'Info' },
  { key: LogLevel.WARN, label: 'Warn' },
  { key: LogLevel.ERROR, label: 'Error' },
];

const LEVEL_LABEL: Record<number, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO',
  [LogLevel.WARN]: 'WARN',
  [LogLevel.ERROR]: 'ERROR',
};

function levelColor(t: Theme, level: number): string {
  switch (level) {
    case LogLevel.DEBUG:
      return t.colors.logLevel.debug;
    case LogLevel.INFO:
      return t.colors.logLevel.info;
    case LogLevel.WARN:
      return t.colors.logLevel.warn;
    case LogLevel.ERROR:
      return t.colors.logLevel.error;
    default:
      return t.colors.textMuted;
  }
}

/** Soft row tint for at-a-glance severity (warn/error wash; debug/info none). */
function levelTint(t: Theme, level: number): string {
  switch (level) {
    case LogLevel.WARN:
      return t.colors.tint.warn;
    case LogLevel.ERROR:
      return t.colors.tint.error;
    default:
      return 'transparent';
  }
}

// ─── Tab body ─────────────────────────────────────────────────────────────

export const LogsTab = React.memo(function LogsTab(): React.ReactElement {
  const { logSource, selectedSessionId, getSessionLogs } = useDebugPanel();
  const t = useTheme();

  // Are we viewing a PAST session? `selectedSessionId` is undefined for the live
  // session; a value means the user picked a prior one in the header selector.
  const viewingPast = selectedSessionId !== undefined;

  // Live entries — subscribed so new logs stream in.
  const liveEntries = useSyncExternalStore(
    logSource !== null ? logSource.subscribe : noopSubscribe,
    logSource !== null ? logSource.getSnapshot : emptySnapshot
  );

  // Past-session entries — a one-shot read of that session's persisted logs
  // (read-only; the live session keeps recording to `logSource` untouched).
  const pastEntries = useMemo<readonly LogEntry[]>(
    () =>
      viewingPast && getSessionLogs !== undefined && selectedSessionId !== undefined
        ? getSessionLogs(selectedSessionId)
        : [],
    [viewingPast, getSessionLogs, selectedSessionId]
  );

  const entries = viewingPast ? pastEntries : liveEntries;

  // Filter selections persist across panel opens (and app restarts when a
  // `persist` adapter is configured on the provider). The search query is
  // transient and intentionally not persisted.
  const [activeLevel, setActiveLevel] = usePersistentState<number | 'all'>(
    'logs.level',
    ALL_LEVELS_KEY
  );
  // Multi-select filter sets (empty = no filter). Edited via the Filter sheet.
  const [activeNamespaces, setActiveNamespaces] = usePersistentState<string[]>(
    'logs.namespaces',
    []
  );
  const [activeScreens, setActiveScreens] = usePersistentState<string[]>('logs.screens', []);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<LogEntry | null>(null);
  const copy = useCopy();

  // Long-press a row → copy its message without opening the detail sheet.
  const onCopyRow = useCallback((entry: LogEntry) => copy(entry.message, 'log'), [copy]);

  // renderItem depends on `query` (for match highlighting) and the stable
  // callbacks; rows are React.memo'd so unchanged rows skip re-render.
  const renderItem = useCallback<ListRenderItem<LogEntry>>(
    ({ item }) => <LogRow entry={item} query={query} onSelect={setSelected} onCopy={onCopyRow} />,
    [query, onCopyRow]
  );

  const { counts, namespaces, screens } = useMemo(() => {
    const c: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const ns = new Set<string>();
    const sc = new Set<string>();
    for (const e of entries) {
      c[e.level] = (c[e.level] ?? 0) + 1;
      ns.add(e.namespace);
      if (e.screen !== undefined) sc.add(e.screen);
    }
    return { counts: c, namespaces: [...ns].sort(), screens: [...sc].sort() };
  }, [entries]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    // Empty set = no filter; otherwise match if the entry's namespace starts
    // with ANY selected namespace prefix.
    const matchNs = (e: LogEntry) =>
      activeNamespaces.length === 0 || activeNamespaces.some(ns => e.namespace.startsWith(ns));
    const matchLevel = (e: LogEntry) => activeLevel === ALL_LEVELS_KEY || e.level === activeLevel;
    // Empty set = no filter; otherwise match the entry's screen against the set.
    const matchScreen = (e: LogEntry) =>
      activeScreens.length === 0 || (e.screen !== undefined && activeScreens.includes(e.screen));
    const matchQuery = (e: LogEntry) => lowered === '' || e.message.toLowerCase().includes(lowered);
    const out = entries.filter(e => matchLevel(e) && matchNs(e) && matchScreen(e) && matchQuery(e));
    return out.slice().reverse();
  }, [entries, activeLevel, activeNamespaces, activeScreens, query]);

  // Filter groups for the sheet — the Screen group only appears once at least
  // one entry carries a screen (otherwise it would be an empty group).
  const filterGroups = useMemo<FilterGroup[]>(() => {
    const groups: FilterGroup[] = [
      { key: 'namespace', label: 'Namespace', options: namespaces.map(n => ({ value: n })) },
    ];
    if (screens.length > 0) {
      groups.push({ key: 'screen', label: 'Screen', options: screens.map(s => ({ value: s })) });
    }
    return groups;
  }, [namespaces, screens]);

  const activeFilterCount = activeNamespaces.length + activeScreens.length;

  // Past session selected but no reader wired (or no persisted logs): explain it,
  // rather than silently showing the live session's logs.
  if (viewingPast && getSessionLogs === undefined) {
    return (
      <TabScaffold toolbar={<ReadOnlyBanner />}>
        <EmptyState
          icon="clock"
          title="Past-session logs unavailable"
          hint="Wire `getSessionLogs={(id) => mmkvTransport.getEntriesForSession(id)}` on <DebugPanelProvider> to view a prior session's persisted logs."
        />
      </TabScaffold>
    );
  }

  if (!viewingPast && logSource === null) {
    return (
      <EmptyState
        title="No log source configured"
        hint="Pass `logSource={memoryTransport}` to <DebugPanelProvider> to populate this tab."
      />
    );
  }

  return (
    <TabScaffold
      toolbar={
        <>
          {viewingPast ? <ReadOnlyBanner /> : null}
          <TabToolbar
            primaryScrolls
            primary={LEVELS.map(l => (
              <FilterChip
                key={String(l.key)}
                label={l.label}
                active={activeLevel === l.key}
                count={l.key === ALL_LEVELS_KEY ? entries.length : (counts[l.key as number] ?? 0)}
                color={typeof l.key === 'number' ? levelColor(t, l.key) : undefined}
                onPress={() => setActiveLevel(l.key)}
              />
            ))}
            search={
              <SearchInput value={query} onChange={setQuery} placeholder="Search log messages…" />
            }
            filter={<FilterButton count={activeFilterCount} onPress={() => setFilterOpen(true)} />}
          />
        </>
      }
    >
      <FilterSheet
        visible={filterOpen}
        groups={filterGroups}
        selections={{ namespace: activeNamespaces, screen: activeScreens }}
        onApply={next => {
          setActiveNamespaces([...(next.namespace ?? [])]);
          setActiveScreens([...(next.screen ?? [])]);
          setFilterOpen(false);
        }}
        onClear={() => {
          setActiveNamespaces([]);
          setActiveScreens([]);
        }}
        onClose={() => setFilterOpen(false)}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={entries.length === 0 ? 'list' : 'search'}
          title={entries.length === 0 ? 'No logs yet' : 'No matching logs'}
          hint={
            entries.length === 0
              ? 'Logs written through the configured logger will appear here.'
              : 'Adjust the filters or clear the search.'
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          initialNumToRender={20}
          windowSize={5}
          maxToRenderPerBatch={20}
          removeClippedSubviews
          accessibilityRole="list"
        />
      )}

      <LogDetail entry={selected} onClose={() => setSelected(null)} />
    </TabScaffold>
  );
});

// ─── Row ──────────────────────────────────────────────────────────────────

function keyExtractor(e: LogEntry): string {
  return e.id;
}

const LogRow = React.memo(function LogRow({
  entry,
  query,
  onSelect,
  onCopy,
}: {
  entry: LogEntry;
  query: string;
  onSelect(entry: LogEntry): void;
  onCopy(entry: LogEntry): void;
}): React.ReactElement {
  const t = useTheme();
  const handlePress = useCallback(() => onSelect(entry), [onSelect, entry]);
  const handleLongPress = useCallback(() => onCopy(entry), [onCopy, entry]);
  return (
    <ListRow
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityLabel={`${LEVEL_LABEL[entry.level]} from ${entry.namespace}: ${entry.message}`}
      accessibilityHint="Double tap for details, long press to copy the message"
      tint={levelTint(t, entry.level)}
      leading={
        <Badge label={LEVEL_LABEL[entry.level] ?? 'LOG'} color={levelColor(t, entry.level)} />
      }
      title={<Highlight text={entry.message} query={query} variant="body" numberOfLines={1} />}
      subtitle={
        <TextX variant="caption" tone="muted" numberOfLines={1}>
          {entry.namespace}
          {entry.screen !== undefined ? ` · ${entry.screen}` : ''} ·{' '}
          {formatRelativeTime(entry.timestamp)}
        </TextX>
      }
    />
  );
});

// ─── Detail sheet ─────────────────────────────────────────────────────────

function LogDetail({
  entry,
  onClose,
}: {
  entry: LogEntry | null;
  onClose(): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const copy = useCopy();
  const visible = entry !== null;
  const errorText =
    entry?.error !== undefined
      ? `${entry.error.message}${entry.error.stack !== undefined ? `\n\n${entry.error.stack}` : ''}`
      : '';

  return (
    <DetailSheet
      visible={visible}
      title={entry !== null ? `${LEVEL_LABEL[entry.level] ?? ''} · ${entry.namespace}` : ''}
      onClose={onClose}
      actions={
        entry !== null ? (
          <>
            <Button
              label="⧉ JSON"
              size="sm"
              variant="secondary"
              onPress={() => copy(JSON.stringify(toPlain(entry), null, 2), 'log JSON')}
            />
            <Button label="↥ Share" size="sm" onPress={() => copy(formatForShare(entry), 'log')} />
          </>
        ) : null
      }
    >
      {entry !== null ? (
        <>
          {/* Summary: level badge + message + relative/absolute time */}
          <View style={styles.summary}>
            <View style={[styles.levelBadge, { backgroundColor: levelColor(t, entry.level) }]}>
              <TextX mono style={styles.levelBadgeText} tone="inverse">
                {LEVEL_LABEL[entry.level] ?? 'LOG'}
              </TextX>
            </View>
            <View style={styles.summaryMeta}>
              <TextX variant="body" selectable>
                {entry.message}
              </TextX>
              <TextX variant="caption" tone="muted">
                [{entry.namespace}] · {new Date(entry.timestamp).toISOString()}
                {entry.screen !== undefined ? ` · ${entry.screen}` : ''}
                {entry.sessionId !== undefined ? ` · session ${entry.sessionId}` : ''}
              </TextX>
            </View>
          </View>

          {entry.context !== undefined ? (
            <CollapsibleSection
              label="Context"
              defaultExpanded
              onCopy={() => copy(JSON.stringify(entry.context, null, 2), 'context')}
            >
              <JsonTree data={entry.context} />
            </CollapsibleSection>
          ) : null}
          {entry.error !== undefined ? (
            <CollapsibleSection
              label="Error"
              defaultExpanded
              value={errorText}
              onCopy={() => copy(errorText, 'error')}
            />
          ) : null}
        </>
      ) : null}
    </DetailSheet>
  );
}

/** A plain, JSON-safe shape of a log entry for copy-as-JSON. */
function toPlain(entry: LogEntry): Record<string, unknown> {
  return {
    level: LEVEL_LABEL[entry.level] ?? entry.level,
    namespace: entry.namespace,
    message: entry.message,
    timestamp: new Date(entry.timestamp).toISOString(),
    ...(entry.screen !== undefined ? { screen: entry.screen } : {}),
    ...(entry.sessionId !== undefined ? { sessionId: entry.sessionId } : {}),
    ...(entry.context !== undefined ? { context: entry.context } : {}),
    ...(entry.error !== undefined
      ? { error: { message: entry.error.message, stack: entry.error.stack } }
      : {}),
  };
}

function formatForShare(entry: LogEntry): string {
  const parts = [
    `[${LEVEL_LABEL[entry.level] ?? 'LOG'}] ${entry.namespace}`,
    `${new Date(entry.timestamp).toISOString()}`,
    `${entry.message}`,
  ];
  if (entry.context !== undefined) parts.push(`Context: ${JSON.stringify(entry.context)}`);
  if (entry.error !== undefined)
    parts.push(`Error: ${entry.error.message}\n${entry.error.stack ?? ''}`);
  return parts.join('\n');
}

// ─── Defaults ─────────────────────────────────────────────────────────────

function noopSubscribe(): () => void {
  return () => undefined;
}
const EMPTY: readonly LogEntry[] = [];
function emptySnapshot(): readonly LogEntry[] {
  return EMPTY;
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    summary: { flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md },
    levelBadge: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radii.pill,
      minWidth: 52,
      alignItems: 'center',
    },
    levelBadgeText: { fontSize: 11, fontWeight: '700' },
    summaryMeta: { flex: 1, gap: 2 },
  });
}
