import React, { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import type { ListRenderItem } from 'react-native';
import { FlatList, StyleSheet, View } from 'react-native';
import type { NetworkLogEntry } from '../../integrations/http';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { DetailSheet } from '../components/DetailSheet';
import { EmptyState } from '../components/EmptyState';
import { FilterChip } from '../components/FilterChip';
import { Highlight } from '../components/Highlight';
import { JsonTree } from '../components/JsonTree';
import { KeyValueRows, headerRows } from '../components/KeyValueRows';
import { ListRow } from '../components/ListRow';
import { MethodBadge, methodColor } from '../components/MethodBadge';
import { Segmented } from '../components/Segmented';
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
import {
  formatBody,
  formatHeaders,
  formatNetworkExport,
  formatNetworkExportAll,
  parseBodyForTree,
} from './networkExport';
import { MockRulesView, draftFromEntry } from './MockRulesView';
import type { RuleDraft } from './MockRulesView';

const ALL = 'all' as const;
const STATUS_GROUPS: ReadonlyArray<{
  key: 'all' | '2xx' | '4xx' | '5xx' | 'error';
  label: string;
}> = [
  { key: ALL, label: 'All' },
  { key: '2xx', label: '2xx' },
  { key: '4xx', label: '4xx' },
  { key: '5xx', label: '5xx' },
  { key: 'error', label: 'Failed' },
];

// ─── Tab body ─────────────────────────────────────────────────────────────

export const NetworkTab = React.memo(function NetworkTab(): React.ReactElement {
  const { networkSource, mockEngine } = useDebugPanel();
  const t = useTheme();

  const entries = useSyncExternalStore(
    networkSource !== null ? networkSource.subscribe : noopSubscribe,
    networkSource !== null ? networkSource.getSnapshot : emptySnapshot
  );

  const [statusGroup, setStatusGroup] = usePersistentState<(typeof STATUS_GROUPS)[number]['key']>(
    'network.statusGroup',
    ALL
  );
  // Multi-select filter sets (empty = no filter), edited via the Filter sheet.
  const [methodFilters, setMethodFilters] = usePersistentState<string[]>('network.methods', []);
  const [screenFilters, setScreenFilters] = usePersistentState<string[]>('network.screens', []);
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<NetworkLogEntry | null>(null);
  // 'requests' = captured log; 'rules' = the mock-rules editor (only with an engine).
  const [view, setView] = useState<'requests' | 'rules'>('requests');
  const [mockDraft, setMockDraft] = useState<RuleDraft | null>(null);
  const copy = useCopy();

  // "Mock this" from a captured request → seed a respond rule + jump to Rules.
  const onMockEntry = useCallback((entry: NetworkLogEntry) => {
    setMockDraft(
      draftFromEntry(entry.method, entry.url, entry.statusCode ?? 200, entry.responseBody)
    );
    setSelected(null);
    setView('rules');
  }, []);

  // Long-press a row → copy its cURL without opening the detail sheet.
  const onCopyRow = useCallback((entry: NetworkLogEntry) => copy(entry.toCurl(), 'cURL'), [copy]);

  const renderItem = useCallback<ListRenderItem<NetworkLogEntry>>(
    ({ item }) => <NetRow entry={item} query={query} onSelect={setSelected} onCopy={onCopyRow} />,
    [query, onCopyRow]
  );

  const counts = useMemo(() => groupCounts(entries), [entries]);
  // Methods actually present, for the method filter chips (ALL + observed verbs).
  const methods = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) seen.add(e.method.toUpperCase());
    return [...seen].sort();
  }, [entries]);
  // Screens actually present, for the screen filter chips.
  const screens = useMemo(() => {
    const seen = new Set<string>();
    for (const e of entries) if (e.screen !== undefined) seen.add(e.screen);
    return [...seen].sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const matchGroup = (e: NetworkLogEntry) => matchesStatusGroup(e, statusGroup);
    const matchMethod = (e: NetworkLogEntry) =>
      methodFilters.length === 0 || methodFilters.includes(e.method.toUpperCase());
    const matchScreen = (e: NetworkLogEntry) =>
      screenFilters.length === 0 || (e.screen !== undefined && screenFilters.includes(e.screen));
    const matchQuery = (e: NetworkLogEntry) =>
      lowered === '' || e.url.toLowerCase().includes(lowered);
    const out = entries.filter(
      e => matchGroup(e) && matchMethod(e) && matchScreen(e) && matchQuery(e)
    );
    return out.slice().reverse();
  }, [entries, statusGroup, methodFilters, screenFilters, query]);

  const filterGroups = useMemo<FilterGroup[]>(
    () => [
      {
        key: 'method',
        label: 'Method',
        options: methods.map(m => ({ value: m, dotColor: methodColor(t, m) })),
      },
      { key: 'screen', label: 'Screen', options: screens.map(s => ({ value: s })) },
    ],
    [methods, screens, t]
  );
  const activeFilterCount = methodFilters.length + screenFilters.length;

  if (networkSource === null) {
    return (
      <EmptyState
        title="No network source configured"
        hint="Pass `networkSource={httpObserver.store}` to <DebugPanelProvider> to populate this tab."
      />
    );
  }

  const showRules = mockEngine !== undefined && view === 'rules';

  return (
    <TabScaffold
      toolbar={
        <>
          {mockEngine !== undefined ? (
            <TabToolbar
              primary={
                <Segmented<'requests' | 'rules'>
                  accessibilityLabel="View"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'requests', label: 'Requests' },
                    { value: 'rules', label: 'Rules', count: mockEngine.getRules().length },
                  ]}
                />
              }
            />
          ) : null}
          {showRules ? null : (
            <TabToolbar
              primaryScrolls
              primary={STATUS_GROUPS.map(g => (
                <FilterChip
                  key={g.key}
                  label={g.label}
                  active={statusGroup === g.key}
                  count={g.key === ALL ? entries.length : (counts[g.key] ?? 0)}
                  color={statusGroupColor(t, g.key)}
                  onPress={() => setStatusGroup(g.key)}
                />
              ))}
              search={
                <SearchInput value={query} onChange={setQuery} placeholder="Search by URL…" />
              }
              filter={
                <FilterButton count={activeFilterCount} onPress={() => setFilterOpen(true)} />
              }
              meta={
                filtered.length > 0 ? (
                  <>
                    <TextX variant="caption" tone="muted">
                      {`${filtered.length} shown`}
                    </TextX>
                    <Button
                      label="↥ Export all"
                      size="sm"
                      variant="ghost"
                      accessibilityLabel="Export all shown requests"
                      onPress={() => copy(formatNetworkExportAll(filtered, Date.now()), 'requests')}
                    />
                  </>
                ) : undefined
              }
            />
          )}
        </>
      }
    >
      {showRules ? (
        <MockRulesView
          engine={mockEngine}
          initialDraft={mockDraft}
          onDraftConsumed={() => setMockDraft(null)}
        />
      ) : (
        <>
          <FilterSheet
            visible={filterOpen}
            groups={filterGroups}
            selections={{ method: methodFilters, screen: screenFilters }}
            onApply={next => {
              setMethodFilters([...(next.method ?? [])]);
              setScreenFilters([...(next.screen ?? [])]);
              setFilterOpen(false);
            }}
            onClear={() => {
              setMethodFilters([]);
              setScreenFilters([]);
            }}
            onClose={() => setFilterOpen(false)}
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={entries.length === 0 ? 'network' : 'search'}
              title={entries.length === 0 ? 'No network activity yet' : 'No matching requests'}
              hint={
                entries.length === 0
                  ? 'Observed requests will appear here as they happen.'
                  : 'Try a different status filter or clear the search.'
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
        </>
      )}

      <NetworkDetail
        entry={selected}
        onClose={() => setSelected(null)}
        {...(mockEngine !== undefined ? { onMock: onMockEntry } : {})}
      />
    </TabScaffold>
  );
});

// ─── Row ──────────────────────────────────────────────────────────────────

function keyExtractor(e: NetworkLogEntry): string {
  return e.id;
}

const NetRow = React.memo(function NetRow({
  entry,
  query,
  onSelect,
  onCopy,
}: {
  entry: NetworkLogEntry;
  query: string;
  onSelect(entry: NetworkLogEntry): void;
  onCopy(entry: NetworkLogEntry): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const statusLabel = formatStatus(entry);
  const handlePress = useCallback(() => onSelect(entry), [onSelect, entry]);
  const handleLongPress = useCallback(() => onCopy(entry), [onCopy, entry]);
  return (
    <ListRow
      onPress={handlePress}
      onLongPress={handleLongPress}
      accessibilityLabel={`${entry.method} ${entry.url}, status ${statusLabel}`}
      accessibilityHint="Double tap for details, long press to copy as cURL"
      tint={statusTint(t, entry)}
      leading={<MethodBadge method={entry.method} />}
      title={<Highlight text={entry.url} query={query} variant="body" mono numberOfLines={1} />}
      subtitle={
        <TextX variant="caption" tone="muted" numberOfLines={1}>
          {entry.durationMs !== undefined ? `${entry.durationMs}ms · ` : ''}
          {formatRelativeTime(entry.timestamp)}
          {entry.screen !== undefined ? ` · ${entry.screen}` : ''}
        </TextX>
      }
      trailing={
        <TextX mono style={[styles.rowStatus, { color: statusColor(t, entry) }]} numberOfLines={1}>
          {statusLabel}
        </TextX>
      }
    />
  );
});

// ─── Detail sheet ─────────────────────────────────────────────────────────

function NetworkDetail({
  entry,
  onClose,
  onMock,
}: {
  entry: NetworkLogEntry | null;
  onClose(): void;
  /** When provided, a "Mock this" action seeds a rule from this entry. */
  onMock?: (entry: NetworkLogEntry) => void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const copy = useCopy();
  const visible = entry !== null;

  const reqHeaderRows = entry !== null ? headerRows(entry.requestHeaders) : [];
  const resHeaderRows = entry !== null ? headerRows(entry.responseHeaders) : [];
  const reqBody = entry?.requestBody !== undefined ? formatBody(entry.requestBody) : '';
  const resBody = entry?.responseBody !== undefined ? formatBody(entry.responseBody) : '';

  return (
    <DetailSheet
      visible={visible}
      title={entry !== null ? `${entry.method} · ${entry.url}` : ''}
      onClose={onClose}
      actions={
        entry !== null ? (
          <>
            <Button
              label="⧉ cURL"
              size="sm"
              variant="secondary"
              onPress={() => copy(entry.toCurl(), 'cURL')}
            />
            {onMock !== undefined ? (
              <Button
                label="Mock this"
                size="sm"
                variant="secondary"
                accessibilityHint="Creates a mock rule pre-filled from this request"
                onPress={() => onMock(entry)}
              />
            ) : null}
            <Button
              label="↥ Export"
              size="sm"
              onPress={() => copy(formatNetworkExport(entry), 'request')}
            />
          </>
        ) : null
      }
    >
      {entry !== null ? (
        <>
          {/* Summary row: status badge + URL + timing */}
          <View style={styles.summary}>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(t, entry) }]}>
              <TextX mono style={styles.statusBadgeText} tone="inverse">
                {formatStatus(entry)}
              </TextX>
            </View>
            <View style={styles.summaryMeta}>
              <View style={styles.summaryTitleLine}>
                <MethodBadge method={entry.method} size="md" />
                <TextX variant="body" mono selectable numberOfLines={2} style={styles.summaryUrl}>
                  {entry.url}
                </TextX>
              </View>
              <TextX variant="caption" tone="muted">
                {entry.durationMs !== undefined ? `${entry.durationMs}ms · ` : ''}
                {new Date(entry.timestamp).toLocaleTimeString()}
                {entry.source !== undefined ? ` · ${entry.source}` : ''}
                {entry.screen !== undefined ? ` · ${entry.screen}` : ''}
              </TextX>
            </View>
          </View>

          {entry.error !== undefined ? (
            <View style={styles.errorBox}>
              <TextX variant="caption" tone="danger" style={styles.errorLabel}>
                ERROR
              </TextX>
              <TextX variant="body" mono selectable tone="danger">
                {entry.error}
              </TextX>
            </View>
          ) : null}

          {reqHeaderRows.length > 0 ? (
            <CollapsibleSection
              label="Request Headers"
              count={reqHeaderRows.length}
              onCopy={() => copy(formatHeaders(entry.requestHeaders), 'request headers')}
            >
              <KeyValueRows rows={reqHeaderRows} />
            </CollapsibleSection>
          ) : null}
          {entry.requestBody !== undefined ? (
            <BodySection
              label="Request Body"
              body={entry.requestBody}
              onCopy={() => copy(reqBody, 'request body')}
            />
          ) : null}
          {resHeaderRows.length > 0 ? (
            <CollapsibleSection
              label="Response Headers"
              count={resHeaderRows.length}
              onCopy={() => copy(formatHeaders(entry.responseHeaders), 'response headers')}
            >
              <KeyValueRows rows={resHeaderRows} />
            </CollapsibleSection>
          ) : null}
          {entry.responseBody !== undefined ? (
            <BodySection
              label="Response Body"
              body={entry.responseBody}
              defaultExpanded
              onCopy={() => copy(resBody, 'response body')}
            />
          ) : null}
          <CollapsibleSection
            label="cURL"
            value={entry.toCurl()}
            onCopy={() => copy(entry.toCurl(), 'cURL')}
          />
        </>
      ) : null}
    </DetailSheet>
  );
}

/**
 * Renders a request/response body section. A JSON object/array (or a
 * JSON-parseable string) renders as a drillable {@link JsonTree}; anything else
 * (plain text, non-JSON strings) renders as selectable monospace text.
 */
function BodySection({
  label,
  body,
  defaultExpanded,
  onCopy,
}: {
  label: string;
  body: unknown;
  defaultExpanded?: boolean;
  onCopy(): void;
}): React.ReactElement {
  const parsed = parseBodyForTree(body);
  return (
    <CollapsibleSection
      label={label}
      defaultExpanded={defaultExpanded ?? false}
      onCopy={onCopy}
      {...(parsed.kind === 'text' ? { value: parsed.value } : {})}
    >
      {parsed.kind === 'tree' ? <JsonTree data={parsed.value} /> : undefined}
    </CollapsibleSection>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────

function statusGroupColor(t: Theme, key: (typeof STATUS_GROUPS)[number]['key']): string {
  switch (key) {
    case '2xx':
      return t.colors.success;
    case '4xx':
      return t.colors.warning;
    case '5xx':
    case 'error':
      return t.colors.danger;
    default:
      return t.colors.accent;
  }
}

function statusColor(t: Theme, e: NetworkLogEntry): string {
  if (e.state === 'pending') return t.colors.textMuted;
  // A cancelled request is not a failure — render it muted, never danger.
  if (e.state === 'cancelled') return t.colors.textMuted;
  if (e.state === 'error' || e.statusCode === undefined) return t.colors.danger;
  if (e.statusCode >= 500) return t.colors.danger;
  if (e.statusCode >= 400) return t.colors.warning;
  return t.colors.success;
}

function formatStatus(e: NetworkLogEntry): string {
  if (e.state === 'pending') return '…';
  if (e.state === 'cancelled') return 'CANCEL';
  if (e.statusCode !== undefined) return String(e.statusCode);
  return e.state === 'error' ? 'ERR' : '—';
}

/** Soft row tint for at-a-glance status (error/5xx red, 4xx amber, else none). */
function statusTint(t: Theme, e: NetworkLogEntry): string {
  if (e.state === 'pending' || e.state === 'cancelled') return 'transparent';
  if (e.state === 'error' || e.statusCode === undefined || e.statusCode >= 500)
    return t.colors.tint.error;
  if (e.statusCode >= 400) return t.colors.tint.warn;
  return 'transparent';
}

function matchesStatusGroup(
  e: NetworkLogEntry,
  group: (typeof STATUS_GROUPS)[number]['key']
): boolean {
  if (group === ALL) return true;
  // Cancelled requests are excluded from every status group except "All" — they
  // are not failures and have no status code.
  if (e.state === 'cancelled') return false;
  if (group === 'error') return e.state === 'error' || e.statusCode === undefined;
  const code = e.statusCode;
  if (code === undefined) return false;
  if (group === '2xx') return code >= 200 && code < 300;
  if (group === '4xx') return code >= 400 && code < 500;
  if (group === '5xx') return code >= 500;
  return false;
}

function groupCounts(entries: readonly NetworkLogEntry[]): Record<string, number> {
  const out: Record<string, number> = { '2xx': 0, '4xx': 0, '5xx': 0, error: 0 };
  for (const e of entries) {
    if (e.state === 'cancelled') continue;
    if (matchesStatusGroup(e, '2xx')) out['2xx']!++;
    else if (matchesStatusGroup(e, '4xx')) out['4xx']!++;
    else if (matchesStatusGroup(e, '5xx')) out['5xx']!++;
    if (e.state === 'error' || e.statusCode === undefined) out['error']!++;
  }
  return out;
}

// ─── Defaults ─────────────────────────────────────────────────────────────

function noopSubscribe(): () => void {
  return () => undefined;
}
const EMPTY: readonly NetworkLogEntry[] = [];
function emptySnapshot(): readonly NetworkLogEntry[] {
  return EMPTY;
}

function buildStyles(t: Theme) {
  return StyleSheet.create({
    rowStatus: { fontSize: 11, fontWeight: '700', minWidth: 42, textAlign: 'right' },
    summary: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: t.spacing.md,
    },
    statusBadge: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radii.pill,
      minWidth: 44,
      alignItems: 'center',
    },
    statusBadgeText: { fontSize: 12, fontWeight: '700' },
    summaryMeta: { flex: 1, gap: 2 },
    summaryTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      flexWrap: 'wrap',
    },
    summaryUrl: { flexShrink: 1 },
    errorBox: {
      gap: t.spacing.xs,
      padding: t.spacing.md,
      borderRadius: t.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.danger,
      backgroundColor: t.colors.surfaceSubtle,
    },
    errorLabel: { textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  });
}
