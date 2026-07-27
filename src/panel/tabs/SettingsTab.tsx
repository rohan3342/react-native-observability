import React, { useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { ObservabilityConfig } from '../../config';
import type { ObservabilityConfig as ObservabilityConfigType } from '../../config/types';
import { getCurrentSessionId, getSessions } from '../../storage';
import type { SessionMeta } from '../../storage';
import { clearPanic, getInternalMetrics } from '../../logger';
import { getPerfStore } from '../../integrations/perf';
import { getBreadcrumbStore } from '../../integrations/breadcrumbs';
import type { Breadcrumb } from '../../integrations/breadcrumbs';
import { EmptyState } from '../components/EmptyState';
import { FilterChip } from '../components/FilterChip';
import { GroupHeader } from '../components/ListRow';
import { Segmented } from '../components/Segmented';
import { TabScaffold, TabToolbar } from '../templates';
import { Button, TextX, useTheme, useThemeMode } from '../theme';
import type { ThemeMode } from '../theme';
import { usePanelPrefs, usePersistentState } from '../PanelPrefs';
import { useCopy } from '../util/copy';
import { useHaptics } from '../util/haptics';
import { useDebugPanel } from '../useDebugPanel';
import { formatSessionExport } from './sessionExport';
import { summariseHealth, formatBytes } from './settings/health';
import {
  Section,
  InfoRow,
  HealthStatusRow,
  BreadcrumbRow,
  SessionRow,
  buildStyles,
} from './settings/SettingsComponents';

/** A source the Settings clear actions can empty. */
interface Clearable {
  clear?(): void;
}

type SettingsView = 'info' | 'health' | 'timeline' | 'actions';

// Injected at build time from package.json (see tsup `define`); falls back in
// the test/dev runtime where the define isn't applied.
const OBSERVABILITY_VERSION =
  typeof __OBSERVABILITY_VERSION__ !== 'undefined' ? __OBSERVABILITY_VERSION__ : '0.0.0-dev';

const MODE_LABELS: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export const SettingsTab = React.memo(function SettingsTab(): React.ReactElement {
  const { logSource, networkSource, screenSource, stateSliceRegistry, closePanel, onClearStorage } =
    useDebugPanel();
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const copy = useCopy();
  const haptics = useHaptics();
  const { mode, setMode } = useThemeMode();
  const prefs = usePanelPrefs();
  const perfStore = useMemo(() => getPerfStore(), []);
  // Top-level view: Info (app/session/appearance), Health (metrics), Actions
  // (export + clears). Persisted across opens.
  const [view, setView] = usePersistentState<SettingsView>('settings.view', 'info');
  // Two-step confirm for the destructive "Clear all" action.
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  // ObservabilityConfig.get() throws when init() has not been called.
  // Degrade gracefully — show an "uninitialized" hint rather than crashing.
  const config = useMemo<ObservabilityConfigType | null>(() => {
    try {
      return ObservabilityConfig.get() as ObservabilityConfigType;
    } catch {
      return null;
    }
  }, []);

  const sessionId = getCurrentSessionId();
  const [refreshTick, forceRefresh] = useState(0);

  const sessions = useMemo<SessionMeta[]>(() => getSessions(), [refreshTick]);
  const crashedCount = useMemo(() => sessions.filter(s => s.crashed === true).length, [sessions]);

  const metrics = useMemo(() => getInternalMetrics(), [refreshTick]);
  const health = useMemo(() => summariseHealth(metrics), [metrics]);

  const breadcrumbStore = useMemo(() => getBreadcrumbStore(), []);
  const breadcrumbs = useSyncExternalStore(breadcrumbStore.subscribe, breadcrumbStore.getSnapshot);
  const crashTrail = useMemo<{ sessionId: string; crumbs: Breadcrumb[] } | null>(() => {
    const crashed = sessions.find(s => s.crashed === true && s.sessionId !== sessionId);
    if (crashed === undefined) return null;
    const crumbs = breadcrumbStore.loadTrail(crashed.sessionId);
    return crumbs.length > 0 ? { sessionId: crashed.sessionId, crumbs } : null;
  }, [sessions, sessionId, breadcrumbStore, refreshTick]);
  const [showTrail, setShowTrail] = useState(true);

  const onShareLogs = (): void => {
    if (logSource === null) return;
    const entries = logSource.getSnapshot();
    const formatted = entries
      .map(
        e =>
          `[${new Date(e.timestamp).toISOString()}] [${e.namespace}] ${e.message}` +
          (e.context !== undefined ? ` ${JSON.stringify(e.context)}` : '') +
          (e.error !== undefined ? `\n${e.error.stack ?? e.error.message}` : '')
      )
      .join('\n');
    copy(formatted, 'logs');
  };

  const callClear = (source: Clearable | null): void => {
    source?.clear?.();
    forceRefresh(n => n + 1);
  };

  const onClearAll = (): void => {
    logSource?.clear?.();
    networkSource?.clear?.();
    screenSource?.clear?.();
    perfStore.clear();
    prefs?.clear?.();
    onClearStorage?.();
    setConfirmClearAll(false);
    forceRefresh(n => n + 1);
  };

  const onExportSession = (): void => {
    const state: Record<string, unknown> = {};
    for (const sliceName of stateSliceRegistry.getSnapshot()) {
      try {
        const selector = stateSliceRegistry.get(sliceName);
        state[sliceName] = selector !== undefined ? selector() : undefined;
      } catch (err) {
        state[sliceName] = `<selector threw: ${err instanceof Error ? err.message : String(err)}>`;
      }
    }
    const bundle = formatSessionExport({
      sessionId,
      version: OBSERVABILITY_VERSION,
      generatedAt: Date.now(),
      ...(logSource !== null ? { logs: logSource.getSnapshot() } : {}),
      ...(networkSource !== null ? { network: networkSource.getSnapshot() } : {}),
      ...(screenSource !== null ? { screens: screenSource.getSnapshot() } : {}),
      ...(Object.keys(state).length > 0 ? { state } : {}),
    });
    copy(bundle, 'session');
  };

  return (
    <TabScaffold
      toolbar={
        <TabToolbar
          primary={
            <Segmented<SettingsView>
              accessibilityLabel="Settings view"
              value={view}
              onChange={setView}
              options={[
                { value: 'info', label: 'Info' },
                { value: 'health', label: 'Health' },
                { value: 'timeline', label: 'Timeline' },
                { value: 'actions', label: 'Actions' },
              ]}
            />
          }
        />
      }
    >
      <ScrollView contentContainerStyle={styles.body}>
        {/* ── Info view ───────────────────────────────────────────────────── */}
        {view === 'info' ? (
          <>
            <Section title="App">
              {config !== null ? (
                <>
                  <InfoRow label="Name" value={config.app.name} />
                  <InfoRow label="Version" value={config.app.version} />
                  <InfoRow label="Build" value={String(config.app.buildNumber)} />
                  <InfoRow label="Build type" value={config.app.buildType} />
                  {config.app.currentEnvironment !== undefined ? (
                    <InfoRow label="Environment" value={config.app.currentEnvironment} />
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title="ObservabilityConfig not initialized"
                  hint="Call ObservabilityConfig.init({ app: { ... } }) during bootstrap to populate this section."
                />
              )}
            </Section>

            {sessionId !== undefined ? (
              <Section title="Session">
                <InfoRow label="Current session" value={sessionId} />
              </Section>
            ) : null}

            {sessions.length > 0 ? (
              <Section title="Session health">
                <InfoRow
                  label="Status"
                  value={crashedCount === 0 ? '✓ crash-free' : `⚠ ${crashedCount} crashed`}
                />
                <InfoRow label="Sessions tracked" value={String(sessions.length)} />
                {sessions.map(s => (
                  <SessionRow key={s.sessionId} session={s} isCurrent={s.sessionId === sessionId} />
                ))}
              </Section>
            ) : null}

            <Section title="Observability">
              <InfoRow label="Version" value={OBSERVABILITY_VERSION} />
            </Section>

            <Section title="Appearance">
              <View style={styles.modeRow}>
                {(['light', 'dark', 'system'] as const).map(m => (
                  <FilterChip
                    key={m}
                    label={MODE_LABELS[m]}
                    active={mode === m}
                    onPress={() => setMode(m)}
                  />
                ))}
              </View>
            </Section>
          </>
        ) : null}

        {/* ── Health view ─────────────────────────────────────────────────── */}
        {view === 'health' ? (
          <Section title="SDK health">
            <HealthStatusRow status={health.status} />

            {metrics.panic.tripped ? (
              <>
                <InfoRow label="Reason" value={metrics.panic.reason ?? 'unknown'} />
                <Button
                  label="Clear panic (resume delivery)"
                  variant="primary"
                  onPress={() => {
                    clearPanic();
                    forceRefresh(n => n + 1);
                  }}
                />
              </>
            ) : null}

            {health.problems.length > 0 ? (
              health.problems.map(p => <InfoRow key={p.label} label={p.label} value={p.value} />)
            ) : metrics.panic.tripped ? null : (
              <TextX variant="caption" tone="muted">
                No drops or failures — telemetry is being delivered.
              </TextX>
            )}

            {health.expectedDrops.length > 0 ? (
              <>
                <GroupHeader title="Dropped by design" />
                {health.expectedDrops.map(p => (
                  <InfoRow key={p.label} label={p.label} value={p.value} />
                ))}
              </>
            ) : null}

            <GroupHeader title="Throughput" />
            <InfoRow label="Adapter deliveries" value={String(metrics.adapter.calls)} />
            <InfoRow label="Stored entries" value={String(metrics.storage.writes)} />
            {metrics.storage.bytes > 0 ? (
              <InfoRow label="Stored size" value={formatBytes(metrics.storage.bytes)} />
            ) : null}

            <Button label="Refresh" variant="secondary" onPress={() => forceRefresh(n => n + 1)} />
          </Section>
        ) : null}

        {/* ── Timeline view ───────────────────────────────────────────────── */}
        {view === 'timeline' ? (
          <Section title="Timeline">
            {crashTrail !== null && showTrail ? (
              <View style={styles.crashBanner}>
                <View style={styles.crashBannerHead}>
                  <TextX variant="label" style={{ color: t.colors.danger }}>
                    ⚠ Crash trail
                  </TextX>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss crash trail"
                    onPress={() => {
                      breadcrumbStore.clearTrail(crashTrail.sessionId);
                      setShowTrail(false);
                    }}
                  >
                    <TextX variant="caption" tone="accent">
                      Dismiss
                    </TextX>
                  </Pressable>
                </View>
                <TextX variant="caption" tone="muted">
                  Last {crashTrail.crumbs.length} events before session{' '}
                  {crashTrail.sessionId.slice(0, 8)} crashed:
                </TextX>
                {crashTrail.crumbs
                  .slice()
                  .reverse()
                  .map(c => (
                    <BreadcrumbRow key={c.id} crumb={c} />
                  ))}
              </View>
            ) : null}

            <GroupHeader title="Live" count={breadcrumbs.length} />
            {breadcrumbs.length === 0 ? (
              <TextX variant="caption" tone="muted">
                No breadcrumbs yet. Add a `BreadcrumbTransport` to your logger and pass
                `breadcrumbs` to `createHttpObserver` to record logs, navigation, and network here.
              </TextX>
            ) : (
              breadcrumbs
                .slice()
                .reverse()
                .map(c => <BreadcrumbRow key={c.id} crumb={c} />)
            )}
          </Section>
        ) : null}

        {/* ── Actions view ────────────────────────────────────────────────── */}
        {view === 'actions' ? (
          <Section title="Bulk actions">
            <Button label="↥ Export session (JSON)" variant="primary" onPress={onExportSession} />
            <Button
              label="Share all logs"
              variant="secondary"
              disabled={logSource === null || logSource.getSnapshot().length === 0}
              onPress={onShareLogs}
            />
            <Button
              label="Clear logs"
              variant="secondary"
              disabled={logSource === null}
              onPress={() => callClear(logSource)}
            />
            <Button
              label="Clear network history"
              variant="secondary"
              disabled={networkSource === null}
              onPress={() => callClear(networkSource)}
            />
            <Button
              label="Clear screen history"
              variant="secondary"
              disabled={screenSource === null}
              onPress={() => callClear(screenSource)}
            />
            <Button
              label="Clear performance"
              variant="secondary"
              onPress={() => {
                perfStore.clear();
                forceRefresh(n => n + 1);
              }}
            />
            {prefs?.clear !== undefined ? (
              <Button
                label="Clear panel prefs"
                variant="secondary"
                onPress={() => {
                  prefs.clear?.();
                  forceRefresh(n => n + 1);
                }}
              />
            ) : null}
            {onClearStorage !== undefined ? (
              <Button
                label="Clear persisted storage (MMKV)"
                variant="secondary"
                accessibilityHint="Erases logs, sessions, and breadcrumb trails saved on device"
                onPress={() => {
                  onClearStorage();
                  forceRefresh(n => n + 1);
                }}
              />
            ) : null}
            {confirmClearAll ? (
              <>
                <Button
                  label="Confirm clear all"
                  variant="danger"
                  accessibilityHint="Permanently clears logs, network, screens, performance, and persisted storage"
                  onPress={onClearAll}
                />
                <Button label="Cancel" variant="ghost" onPress={() => setConfirmClearAll(false)} />
              </>
            ) : (
              <Button
                label="Clear all"
                variant="danger"
                accessibilityHint="Asks for confirmation, then clears every data source"
                onPress={() => {
                  haptics.notify('warning');
                  setConfirmClearAll(true);
                }}
              />
            )}
          </Section>
        ) : null}

        <Button label="Close panel" variant="ghost" onPress={closePanel} />
      </ScrollView>
    </TabScaffold>
  );
});
