import React, { useCallback, useMemo, useReducer, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { VirtualList } from '../components/VirtualList';
import { FeatureFlagManager } from '../../config';
import { EmptyState } from '../components/EmptyState';
import { Segmented } from '../components/Segmented';
import { JsonTree } from '../components/JsonTree';
import { Badge } from '../components/ListRow';
import { AnimatedChevron } from '../components/AnimatedChevron';
import { TabScaffold, TabToolbar } from '../templates';
import { Button, TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import { usePersistentState } from '../PanelPrefs';
import { useCopy } from '../util/copy';
import { diffValues } from '../util/diff';
import { useDebugPanel } from '../useDebugPanel';
import {
  isTreeValue,
  safeStringify,
  shapePreview,
  topLevelCount,
  valueType,
  type ValueType,
} from './stateFormat';

type ViewMode = 'slices' | 'flags';

export const StateTab = React.memo(function StateTab(): React.ReactElement {
  const { stateSliceRegistry } = useDebugPanel();
  const [view, setView] = usePersistentState<ViewMode>('state.view', 'slices');
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);

  const sliceNames = useSyncExternalStore(
    stateSliceRegistry.subscribe,
    stateSliceRegistry.getSnapshot
  );

  const [refreshTick, forceRefresh] = useReducer((x: number) => x + 1, 0);
  // Re-read on every refresh tick: flags seeded after the first render (a late
  // FeatureFlagManager.init / override) must appear, so an empty-dep memo would
  // pin a stale list (audit STATE-1). The ⟳ button and flag toggles bump the tick.
  const knownFlags = useMemo(() => FeatureFlagManager.getKnownFlags(), [refreshTick]);

  return (
    <TabScaffold
      toolbar={
        <TabToolbar
          primary={
            <Segmented<ViewMode>
              accessibilityLabel="State view"
              value={view}
              onChange={setView}
              options={[
                { value: 'slices', label: 'Slices', count: sliceNames.length },
                { value: 'flags', label: 'Flags', count: knownFlags.length },
              ]}
            />
          }
          trailing={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh state"
              accessibilityHint="Re-reads registered slices and feature flags"
              onPress={forceRefresh}
              hitSlop={t.hitSlop.loose}
              style={({ pressed }) => [styles.refreshBtn, pressed && pressedOverlay]}
            >
              <Icon name="refresh" size="md" tone="muted" decorative />
            </Pressable>
          }
        />
      }
    >
      {view === 'slices' ? (
        <SlicesView names={sliceNames} registry={stateSliceRegistry} />
      ) : (
        <FlagsView flags={knownFlags} onChanged={forceRefresh} />
      )}
    </TabScaffold>
  );
});

// ─── Slices view ──────────────────────────────────────────────────────────

/** A fixed vertical gap between virtualized rows (replaces the old container gap). */
function RowGap(): React.ReactElement {
  return <View style={{ height: 10 }} />;
}

interface SliceRegistryView {
  get(name: string): (() => unknown) | undefined;
}

function SlicesView({
  names,
  registry,
}: {
  names: readonly string[];
  registry: SliceRegistryView;
}): React.ReactElement {
  return (
    <VirtualList<string>
      data={names}
      keyExtractor={name => name}
      renderItem={({ item }) => <SliceCard name={item} selector={registry.get(item)} />}
      ItemSeparatorComponent={RowGap}
      contentPadding={12}
      ListEmptyComponent={
        <EmptyState
          icon="diamond"
          title="No state slices registered"
          hint="Call useDebugPanel().registerStateSlice('name', () => yourSelector) from any component to expose state here."
        />
      }
    />
  );
}

/** Type-tag colour for the slice card badge. */
function typeColor(t: Theme, vt: ValueType): string {
  switch (vt) {
    case 'obj':
      return t.colors.method.post; // blue
    case 'arr':
      return t.colors.method.patch; // violet
    case 'str':
      return t.colors.success;
    case 'num':
      return t.colors.warning;
    case 'bool':
      return t.colors.info;
    case 'fn':
      return t.colors.method.put;
    default:
      return t.colors.textSubtle; // null / undef / other
  }
}

function SliceCard({
  name,
  selector,
}: {
  name: string;
  selector: (() => unknown) | undefined;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const copy = useCopy();
  // A captured snapshot of the slice value; when set, the card shows what
  // changed since (added/removed/changed keys). Cleared on demand.
  const [snapshot, setSnapshot] = useState<{ value: unknown } | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Evaluate the selector once per render; derive the live value, a one-line
  // preview for the collapsed header, the type tag, the count, and the full JSON.
  const { value, isTree, full, count, vt, preview } = useMemo(() => {
    if (selector === undefined) {
      return {
        value: undefined as unknown,
        isTree: false,
        full: '<not registered>',
        count: undefined as number | undefined,
        vt: 'other' as ValueType,
        preview: '<not registered>',
      };
    }
    try {
      const v = selector();
      return {
        value: v,
        isTree: isTreeValue(v),
        full: safeStringify(v),
        count: topLevelCount(v),
        vt: valueType(v),
        preview: shapePreview(v),
      };
    } catch (err) {
      const msg = `<selector threw: ${err instanceof Error ? err.message : String(err)}>`;
      return {
        value: undefined as unknown,
        isTree: false,
        full: msg,
        count: undefined as number | undefined,
        vt: 'other' as ValueType,
        preview: msg,
      };
    }
  }, [selector]);

  const onCopy = useCallback(() => copy(`${name}\n${full}`, name), [copy, name, full]);
  const diff = snapshot !== null ? diffValues(snapshot.value, value) : null;
  const typeLabel = count !== undefined ? `${vt} · ${count}` : vt;

  return (
    <View style={styles.sliceCard}>
      <View style={styles.sliceHeader}>
        <Pressable
          style={({ pressed }) => [styles.sliceHeaderMain, pressed && pressedOverlay]}
          onPress={() => setExpanded(e => !e)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${name}, ${vt}, ${expanded ? 'expanded' : 'collapsed'}`}
        >
          <AnimatedChevron expanded={expanded} style={styles.sliceCaret} />
          <TextX variant="label" numberOfLines={1} style={styles.sliceName}>
            {name}
          </TextX>
          <Badge label={typeLabel} color={typeColor(t, vt)} />
          <TextX variant="caption" tone="muted" mono numberOfLines={1} style={styles.slicePreview}>
            {preview}
          </TextX>
        </Pressable>
        <Pressable
          onPress={onCopy}
          accessibilityRole="button"
          accessibilityLabel={`Copy ${name}`}
          accessibilityHint="Shares this slice's value via the system share sheet"
          hitSlop={t.hitSlop.default}
          style={({ pressed }) => [styles.sliceCopy, pressed && pressedOverlay]}
        >
          <Icon name="copy" size={16} tone="accent" decorative />
        </Pressable>
      </View>
      {expanded ? (
        <View style={styles.sliceBody}>
          {isTree ? (
            <>
              <SliceDiffControls
                hasSnapshot={snapshot !== null}
                diff={diff}
                onSnapshot={() => setSnapshot({ value })}
                onClear={() => setSnapshot(null)}
              />
              <JsonTree data={value} />
            </>
          ) : (
            <TextX variant="body" mono>
              {full}
            </TextX>
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Snapshot/diff controls + result for a slice. */
function SliceDiffControls({
  hasSnapshot,
  diff,
  onSnapshot,
  onClear,
}: {
  hasSnapshot: boolean;
  diff: ReturnType<typeof diffValues> | null;
  onSnapshot(): void;
  onClear(): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  return (
    <View style={styles.diffWrap}>
      <View style={styles.diffControls}>
        <Button
          label={hasSnapshot ? '⟳ Re-snapshot' : '📸 Snapshot'}
          size="sm"
          variant="secondary"
          onPress={onSnapshot}
        />
        {hasSnapshot ? <Button label="Clear" size="sm" variant="ghost" onPress={onClear} /> : null}
      </View>
      {diff !== null ? (
        diff.changed ? (
          <View style={styles.diffList}>
            {diff.entries.map(e => (
              <TextX key={`${e.kind}:${e.key}`} variant="caption" mono style={diffStyle(t, e.kind)}>
                {diffPrefix(e.kind)} {e.key}
                {e.kind === 'changed' ? `: ${e.before ?? ''} → ${e.after ?? ''}` : ''}
                {e.kind === 'added' ? `: ${e.after ?? ''}` : ''}
                {e.kind === 'removed' ? `: ${e.before ?? ''}` : ''}
              </TextX>
            ))}
          </View>
        ) : (
          <TextX variant="caption" tone="muted" style={styles.diffNone}>
            No changes since snapshot
          </TextX>
        )
      ) : null}
    </View>
  );
}

function diffPrefix(kind: 'added' | 'removed' | 'changed'): string {
  return kind === 'added' ? '+' : kind === 'removed' ? '−' : '~';
}

function diffStyle(t: Theme, kind: 'added' | 'removed' | 'changed') {
  const color =
    kind === 'added' ? t.colors.success : kind === 'removed' ? t.colors.danger : t.colors.warning;
  return { color };
}

// ─── Flags view ───────────────────────────────────────────────────────────

function FlagsView({
  flags,
  onChanged,
}: {
  flags: readonly string[];
  onChanged(): void;
}): React.ReactElement {
  return (
    <VirtualList<string>
      data={flags}
      keyExtractor={key => key}
      renderItem={({ item }) => <FlagRow flagKey={item} onChanged={onChanged} />}
      ItemSeparatorComponent={RowGap}
      contentPadding={12}
      ListEmptyComponent={
        <EmptyState
          icon="flag"
          title="No feature flags registered"
          hint="Call FeatureFlagManager.init({ flag_name: true }) during bootstrap to surface flags here."
        />
      }
    />
  );
}

function FlagRow({
  flagKey,
  onChanged,
}: {
  flagKey: string;
  onChanged(): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const enabled = FeatureFlagManager.isEnabled(flagKey);
  const overridden = FeatureFlagManager.hasOverride(flagKey);

  const onToggle = useCallback(
    (next: boolean) => {
      FeatureFlagManager.override(flagKey, next);
      onChanged();
    },
    [flagKey, onChanged]
  );

  const onClearOverride = useCallback(() => {
    FeatureFlagManager.clearOverride(flagKey);
    onChanged();
  }, [flagKey, onChanged]);

  return (
    <View style={styles.flagRow}>
      <View style={styles.flagText}>
        <TextX variant="body" numberOfLines={1}>
          {flagKey}
        </TextX>
        {overridden ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear override on ${flagKey}`}
            accessibilityHint="Reverts this flag to its default value"
            onPress={onClearOverride}
            hitSlop={t.hitSlop.default}
            style={({ pressed }) => [styles.overrideBadge, pressed && pressedOverlay]}
          >
            <TextX style={styles.overrideBadgeText}>OVERRIDDEN · tap to clear</TextX>
          </Pressable>
        ) : null}
      </View>
      {/* Role lives on the real control, not the wrapper, so AT announces the
          switch and its checked state correctly (audit A6). */}
      <Switch
        value={enabled}
        onValueChange={onToggle}
        accessibilityRole="switch"
        accessibilityLabel={`${flagKey}${overridden ? ', overridden' : ''}`}
        accessibilityState={{ checked: enabled }}
      />
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const pressedOverlay: ViewStyle = { opacity: 0.7 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    refreshBtn: {
      width: 32,
      height: 32,
      borderRadius: t.radii.pill,
      backgroundColor: t.colors.surfaceSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sliceCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radii.md,
      backgroundColor: t.colors.surfaceSubtle,
      overflow: 'hidden',
    },
    sliceHeader: { flexDirection: 'row', alignItems: 'center' },
    sliceHeaderMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.sm,
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.md,
    },
    sliceCaret: { width: 12 },
    sliceName: { flexShrink: 0 },
    slicePreview: { flex: 1 },
    sliceCopy: {
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sliceBody: {
      paddingHorizontal: t.spacing.md,
      paddingBottom: t.spacing.md,
      paddingTop: t.spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.colors.border,
      gap: t.spacing.sm,
    },
    diffWrap: { gap: t.spacing.sm, marginBottom: t.spacing.sm },
    diffControls: { flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' },
    diffList: {
      gap: 2,
      padding: t.spacing.sm,
      borderRadius: t.radii.sm,
      backgroundColor: t.colors.surfaceMuted,
    },
    diffNone: { fontStyle: 'italic' },
    flagRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: t.spacing.md,
      paddingHorizontal: t.spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
      gap: t.spacing.lg,
    },
    flagText: { flex: 1, gap: t.spacing.sm },
    overrideBadge: {
      alignSelf: 'flex-start',
      backgroundColor: t.colors.surfaceMuted,
      paddingHorizontal: t.spacing.md - 2,
      paddingVertical: t.spacing.xs,
      borderRadius: t.radii.sm,
    },
    overrideBadgeText: { fontSize: 10, fontWeight: '700', color: t.colors.warning },
  });
}
