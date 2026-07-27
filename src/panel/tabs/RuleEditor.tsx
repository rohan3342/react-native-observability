/**
 * Redesigned Rule Details editor — a sectioned, developer-tool–style form
 * inspired by Android Studio's Network Inspector.
 *
 * Layout: Match → Action → Configuration (action-scoped) → Advanced (collapsed)
 * → Footer (Cancel / Save rule).
 *
 * Business logic (draftToRule, draftFromEntry, engine save path) is untouched —
 * everything here is a pure UI refactor over the same RuleDraft model.
 */

import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { matchesUrlPattern } from '../../integrations/http/mockEngine';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { JsonField } from '../components/JsonField';
import {
  KeyValueEditor,
  RemoveHeadersEditor,
  headersRemoveToNames,
  headersSetToRows,
  namesToHeadersRemove,
  rowsToHeadersSet,
} from '../components/KeyValueEditor';
import { Segmented } from '../components/Segmented';
import { Button, Pill, Surface, TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import { ACTION_OPTIONS } from './ruleDraft';
import type { ActionType, RuleDraft } from './ruleDraft';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMON_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];

const FAULT_KIND_OPTIONS: ReadonlyArray<{ value: 'timeout' | 'networkError'; label: string }> = [
  { value: 'timeout', label: 'Timeout' },
  { value: 'networkError', label: 'Disconnect' },
];

// ─── Local helpers ────────────────────────────────────────────────────────────

function urlPatternHint(pattern: string): string {
  if (pattern.trim() === '') return 'Empty — matches any URL';
  if (pattern.includes('*')) {
    return pattern.includes('**')
      ? 'Glob: ** matches across path segments, * matches within one segment'
      : 'Glob: * matches any run of non-slash characters';
  }
  return 'Substring match — case-insensitive';
}

function statusNote(status: string): string | null {
  const n = Number.parseInt(status, 10);
  if (status.trim() === '' || Number.isNaN(n)) return null;
  if (n < 100 || n > 599) return `Status ${n} is outside the valid 100–599 range.`;
  return null;
}

function methodMatches(ruleMethod: string, sampleMethod: string): boolean {
  if (ruleMethod.trim() === '') return true;
  return ruleMethod.trim().toUpperCase() === sampleMethod.trim().toUpperCase();
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildCardStyles(t), [t]);
  return (
    <Surface bordered variant="subtle" radius="lg" style={styles.card}>
      <View style={styles.header}>
        <TextX variant="caption" tone="muted" style={styles.title}>
          {title.toUpperCase()}
        </TextX>
        {subtitle !== undefined ? (
          <TextX variant="caption" tone="subtle" style={styles.subtitle}>
            {subtitle}
          </TextX>
        ) : null}
      </View>
      <View style={styles.body}>{children}</View>
    </Surface>
  );
}

function buildCardStyles(t: Theme) {
  return StyleSheet.create({
    card: { overflow: 'hidden' },
    header: {
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.md,
      paddingBottom: t.spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
      gap: t.spacing.xs,
    },
    title: { fontWeight: '700', letterSpacing: 0.5 },
    subtitle: { lineHeight: 16 },
    body: { padding: t.spacing.lg, gap: t.spacing.lg },
  });
}

// ─── Field Row ────────────────────────────────────────────────────────────────

function FieldRow({
  label,
  hint,
  error,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly error?: string | null;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.sm }}>
      <TextX
        variant="caption"
        tone="muted"
        style={{ textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: '600' }}
      >
        {label}
      </TextX>
      {children}
      {hint !== undefined ? (
        <TextX variant="caption" tone="subtle">
          {hint}
        </TextX>
      ) : null}
      {error !== null && error !== undefined ? (
        <TextX variant="caption" tone="warning">
          {error}
        </TextX>
      ) : null}
    </View>
  );
}

// ─── Inline text input (single-line) ─────────────────────────────────────────

function InlineInput({
  value,
  onChange,
  placeholder,
  keyboardType,
  accessibilityLabel,
}: {
  readonly value: string;
  onChange(v: string): void;
  readonly placeholder?: string;
  readonly keyboardType?: 'number-pad';
  readonly accessibilityLabel?: string;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildInputStyles(t), [t]);
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={t.colors.textSubtle}
      accessibilityLabel={accessibilityLabel ?? placeholder ?? 'value'}
      autoCapitalize="none"
      autoCorrect={false}
      {...(keyboardType !== undefined ? { keyboardType } : {})}
      style={styles.input}
    />
  );
}

function buildInputStyles(t: Theme) {
  return StyleSheet.create({
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      borderRadius: t.radii.md,
      paddingHorizontal: t.spacing.md,
      paddingVertical: t.spacing.sm + 2,
      color: t.colors.text,
      backgroundColor: t.colors.surfaceSubtle,
      fontFamily: t.typography.mono,
      fontSize: t.typography.body.size,
    },
  });
}

// ─── Method Select ────────────────────────────────────────────────────────────

function MethodSelect({
  value,
  onChange,
}: {
  readonly value: string;
  onChange(v: string): void;
}): React.ReactElement {
  const t = useTheme();
  // If the draft has an uncommon method, include it so it doesn't silently disappear.
  const normalized = value.trim().toUpperCase();
  const extraMethod = normalized !== '' && !COMMON_METHODS.includes(normalized) ? normalized : null;
  const allMethods = extraMethod !== null ? [...COMMON_METHODS, extraMethod] : COMMON_METHODS;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
      <Pill
        label="ANY"
        active={value.trim() === ''}
        onPress={() => onChange('')}
        accessibilityLabel="Match any HTTP method"
      />
      {allMethods.map(m => (
        <Pill
          key={m}
          label={m}
          active={normalized === m}
          onPress={() => onChange(m)}
          accessibilityLabel={`Match ${m} method`}
        />
      ))}
    </View>
  );
}

// ─── Pattern tester (local, no engine) ───────────────────────────────────────

function RuleTester({
  ruleUrl,
  ruleMethod,
}: {
  readonly ruleUrl: string;
  readonly ruleMethod: string;
}): React.ReactElement {
  const t = useTheme();
  const [sampleUrl, setSampleUrl] = useState('');
  const [sampleMethod, setSampleMethod] = useState('GET');
  const styles = useMemo(() => buildInputStyles(t), [t]);

  const pattern = ruleUrl.trim() !== '' ? ruleUrl.trim() : undefined;
  const urlOk = matchesUrlPattern(pattern, sampleUrl);
  const methodOk = methodMatches(ruleMethod, sampleMethod);
  const matches = urlOk && methodOk;
  const canTest = sampleUrl.trim() !== '';

  return (
    <View style={{ gap: t.spacing.md }}>
      <View style={{ gap: t.spacing.sm }}>
        <TextX
          variant="caption"
          tone="muted"
          style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}
        >
          Sample URL
        </TextX>
        <TextInput
          value={sampleUrl}
          onChangeText={setSampleUrl}
          placeholder="https://api.example.com/orders/1"
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel="Test URL"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      <View style={{ gap: t.spacing.sm }}>
        <TextX
          variant="caption"
          tone="muted"
          style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}
        >
          Sample Method
        </TextX>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.sm }}>
          {COMMON_METHODS.map(m => (
            <Pill
              key={m}
              label={m}
              active={sampleMethod === m}
              onPress={() => setSampleMethod(m)}
              accessibilityLabel={`Test with ${m}`}
            />
          ))}
        </View>
      </View>

      {canTest ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          <Icon
            name={matches ? 'check' : 'close'}
            size="sm"
            tone={matches ? 'success' : 'danger'}
            decorative
          />
          <TextX variant="body" tone={matches ? 'success' : 'danger'} weight="600">
            {matches ? 'Rule matches this request' : 'Rule does not match'}
          </TextX>
        </View>
      ) : (
        <TextX variant="caption" tone="subtle">
          Enter a sample URL above to test the pattern.
        </TextX>
      )}
    </View>
  );
}

// ─── Action-scoped config panels ─────────────────────────────────────────────

function RespondConfig({
  d,
  set,
}: {
  readonly d: RuleDraft;
  set<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void;
}): React.ReactElement {
  const t = useTheme();
  const headerRows = useMemo(() => headersSetToRows(d.headersSet), [d.headersSet]);

  return (
    <>
      <FieldRow
        label="Status Code"
        hint="HTTP status code returned to the client."
        error={statusNote(d.status)}
      >
        <TextInput
          value={d.status}
          onChangeText={v => set('status', v)}
          placeholder="200"
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel="Status code"
          keyboardType="number-pad"
          style={buildInputStyles(t).input}
        />
      </FieldRow>

      <FieldRow label="Response Headers" hint="Headers to include in the canned response.">
        <KeyValueEditor
          rows={headerRows}
          onChange={rows => set('headersSet', rowsToHeadersSet(rows))}
          keyPlaceholder="Header-Name"
          valuePlaceholder="value"
          addLabel="+ Add header"
        />
      </FieldRow>

      <FieldRow label="Response Body" hint="JSON object or raw text sent as the response body.">
        <JsonField
          value={d.body}
          onChange={v => set('body', v)}
          placeholder={'{\n  "ok": true\n}'}
          accessibilityLabel="Response body"
        />
      </FieldRow>

      <FieldRow
        label="Delay"
        hint="Artificial latency in milliseconds before the response resolves."
      >
        <InlineInput
          value={d.delayMs}
          onChange={v => set('delayMs', v)}
          placeholder="0"
          keyboardType="number-pad"
          accessibilityLabel="Delay in ms"
        />
      </FieldRow>
    </>
  );
}

function ModifyRequestConfig({
  d,
  set,
}: {
  readonly d: RuleDraft;
  set<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void;
}): React.ReactElement {
  const headerRows = useMemo(() => headersSetToRows(d.headersSet), [d.headersSet]);
  const removeNames = useMemo(() => headersRemoveToNames(d.headersRemove), [d.headersRemove]);

  return (
    <>
      <FieldRow
        label="Add / Set Headers"
        hint="Headers to add or overwrite on the outgoing request."
      >
        <KeyValueEditor
          rows={headerRows}
          onChange={rows => set('headersSet', rowsToHeadersSet(rows))}
          keyPlaceholder="Header-Name"
          valuePlaceholder="value"
          addLabel="+ Add header"
        />
      </FieldRow>

      <FieldRow label="Remove Headers" hint="Header names to strip from the outgoing request.">
        <RemoveHeadersEditor
          names={removeNames}
          onChange={names => set('headersRemove', namesToHeadersRemove(names))}
        />
      </FieldRow>

      <FieldRow
        label="Replace Request Body"
        hint="Replaces the entire outgoing request body. Leave empty to keep the original."
      >
        <JsonField
          value={d.body}
          onChange={v => set('body', v)}
          placeholder="{ }"
          accessibilityLabel="Request body"
        />
      </FieldRow>
    </>
  );
}

function ModifyResponseConfig({
  d,
  set,
}: {
  readonly d: RuleDraft;
  set<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void;
}): React.ReactElement {
  const t = useTheme();
  const headerRows = useMemo(() => headersSetToRows(d.headersSet), [d.headersSet]);
  const removeNames = useMemo(() => headersRemoveToNames(d.headersRemove), [d.headersRemove]);

  return (
    <>
      <FieldRow
        label="Override Status Code"
        hint="Leave blank to keep the real response status."
        error={statusNote(d.status)}
      >
        <TextInput
          value={d.status}
          onChangeText={v => set('status', v)}
          placeholder="blank = keep real"
          placeholderTextColor={t.colors.textSubtle}
          accessibilityLabel="Status code"
          keyboardType="number-pad"
          style={buildInputStyles(t).input}
        />
      </FieldRow>

      <FieldRow label="Set / Add Headers" hint="Headers to set or overwrite on the real response.">
        <KeyValueEditor
          rows={headerRows}
          onChange={rows => set('headersSet', rowsToHeadersSet(rows))}
          keyPlaceholder="Header-Name"
          valuePlaceholder="value"
          addLabel="+ Add header"
        />
      </FieldRow>

      <FieldRow label="Remove Headers" hint="Header names to strip from the real response.">
        <RemoveHeadersEditor
          names={removeNames}
          onChange={names => set('headersRemove', namesToHeadersRemove(names))}
        />
      </FieldRow>

      <FieldRow
        label="Replace Response Body"
        hint="Replaces the entire response body. Leave empty to keep the original."
      >
        <JsonField
          value={d.body}
          onChange={v => set('body', v)}
          placeholder="{ }"
          accessibilityLabel="Response body"
        />
      </FieldRow>
    </>
  );
}

function BlockConfig(): React.ReactElement {
  const t = useTheme();
  return (
    <Surface variant="subtle" bordered radius="md" style={{ padding: t.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: t.spacing.md }}>
        <Icon name="warning" size="md" tone="danger" decorative />
        <View style={{ flex: 1, gap: t.spacing.xs }}>
          <TextX variant="label" tone="danger">
            Request Blocked
          </TextX>
          <TextX variant="body" tone="muted">
            Any request matching the criteria above will be immediately rejected with a synthetic
            network error. No request is sent to the server.
          </TextX>
        </View>
      </View>
    </Surface>
  );
}

function FaultConfig({
  d,
  set,
}: {
  readonly d: RuleDraft;
  set<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void;
}): React.ReactElement {
  const isTimeout = d.faultKind === 'timeout';

  return (
    <>
      <FieldRow
        label="Fault Type"
        hint={
          isTimeout
            ? 'Hangs the request for the specified delay, then fails.'
            : 'Immediately rejects the request with a network error — no response received.'
        }
      >
        <Segmented<'timeout' | 'networkError'>
          accessibilityLabel="Fault kind"
          value={d.faultKind}
          onChange={v => set('faultKind', v)}
          options={FAULT_KIND_OPTIONS}
        />
      </FieldRow>

      {isTimeout ? (
        <FieldRow
          label="Timeout Delay (ms)"
          hint="How long the request hangs before failing. Defaults to 30 000 ms."
        >
          <InlineInput
            value={d.delayMs}
            onChange={v => set('delayMs', v)}
            placeholder="30000"
            keyboardType="number-pad"
            accessibilityLabel="Timeout delay in ms"
          />
        </FieldRow>
      ) : null}
    </>
  );
}

// ─── Advanced fields (per action) ────────────────────────────────────────────

function hasAdvanced(actionType: ActionType): boolean {
  return (
    actionType === 'modifyRequest' || actionType === 'modifyResponse' || actionType === 'fault'
  );
}

function AdvancedFields({
  d,
  set,
}: {
  readonly d: RuleDraft;
  set<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]): void;
}): React.ReactElement | null {
  const t = useTheme();
  const styles = useMemo(() => buildInputStyles(t), [t]);

  if (d.actionType === 'modifyRequest') {
    return (
      <View style={{ gap: t.spacing.lg }}>
        <FieldRow
          label="Override Method"
          hint="Replaces the HTTP method before sending. Leave blank to keep the original."
        >
          <InlineInput
            value={d.reqMethod}
            onChange={v => set('reqMethod', v)}
            placeholder="POST"
            accessibilityLabel="Override method"
          />
        </FieldRow>
        <FieldRow
          label="Override URL"
          hint="Full URL replacement for the outgoing request. Leave blank to keep the original."
        >
          <TextInput
            value={d.reqUrl}
            onChangeText={v => set('reqUrl', v)}
            placeholder="https://staging.api.example.com/orders"
            placeholderTextColor={t.colors.textSubtle}
            accessibilityLabel="Override URL"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
        </FieldRow>
        <FieldRow
          label="Delay (ms)"
          hint="Artificial delay before the (real) request is dispatched."
        >
          <InlineInput
            value={d.delayMs}
            onChange={v => set('delayMs', v)}
            placeholder="0"
            keyboardType="number-pad"
            accessibilityLabel="Delay in ms"
          />
        </FieldRow>
      </View>
    );
  }

  if (d.actionType === 'modifyResponse') {
    return (
      <FieldRow
        label="Delay (ms)"
        hint="Delay before the modified response is returned to the app."
      >
        <InlineInput
          value={d.delayMs}
          onChange={v => set('delayMs', v)}
          placeholder="0"
          keyboardType="number-pad"
          accessibilityLabel="Delay in ms"
        />
      </FieldRow>
    );
  }

  if (d.actionType === 'fault') {
    return (
      <FieldRow
        label="Inject Every Nth Match"
        hint="1 = always inject. 3 = inject on every third matching request. Useful for testing retry logic against intermittent failures."
      >
        <InlineInput
          value={d.everyN}
          onChange={v => set('everyN', v)}
          placeholder="1"
          keyboardType="number-pad"
          accessibilityLabel="Inject every Nth match"
        />
      </FieldRow>
    );
  }

  return null;
}

// ─── Main editor ─────────────────────────────────────────────────────────────

export function RuleEditor({
  draft,
  onSave,
  onCancel,
}: {
  readonly draft: RuleDraft;
  onSave(d: RuleDraft): void;
  onCancel(): void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [d, setD] = useState<RuleDraft>(draft);

  const set = <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) =>
    setD(prev => ({ ...prev, [key]: value }));

  const actionLabel: Record<ActionType, string> = {
    respond: 'Returns a canned response without hitting the server.',
    modifyRequest: 'Mutates the outgoing request before it is sent.',
    modifyResponse: 'Transforms the real response before the app sees it.',
    block: 'Fails the request immediately — no server round-trip.',
    fault: 'Injects a network error or timeout to simulate failure.',
  };

  const showAdvanced = hasAdvanced(d.actionType);

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* ── Match ─────────────────────────────────────────────────────── */}
      <SectionCard title="Match" subtitle="Requests matching all criteria are intercepted.">
        <FieldRow label="HTTP Method" hint="Tap ANY to intercept all methods.">
          <MethodSelect value={d.method} onChange={v => set('method', v)} />
        </FieldRow>

        <FieldRow label="URL Pattern" hint={urlPatternHint(d.url)}>
          <InlineInput
            value={d.url}
            onChange={v => set('url', v)}
            placeholder="/api/orders or **/ads/**"
            accessibilityLabel="URL pattern"
          />
        </FieldRow>

        <CollapsibleSection label="Test Rule" defaultExpanded={false}>
          <RuleTester ruleUrl={d.url} ruleMethod={d.method} />
        </CollapsibleSection>
      </SectionCard>

      {/* ── Action ────────────────────────────────────────────────────── */}
      <SectionCard title="Action" subtitle={actionLabel[d.actionType]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionScroll}
        >
          <Segmented<ActionType>
            accessibilityLabel="Rule action"
            value={d.actionType}
            onChange={v => set('actionType', v)}
            options={ACTION_OPTIONS}
          />
        </ScrollView>
      </SectionCard>

      {/* ── Configuration ─────────────────────────────────────────────── */}
      <SectionCard
        title="Configuration"
        {...(d.actionType !== 'block'
          ? { subtitle: 'Fields relevant to the selected action.' }
          : {})}
      >
        {d.actionType === 'respond' && <RespondConfig d={d} set={set} />}
        {d.actionType === 'modifyRequest' && <ModifyRequestConfig d={d} set={set} />}
        {d.actionType === 'modifyResponse' && <ModifyResponseConfig d={d} set={set} />}
        {d.actionType === 'block' && <BlockConfig />}
        {d.actionType === 'fault' && <FaultConfig d={d} set={set} />}
      </SectionCard>

      {/* ── Advanced ──────────────────────────────────────────────────── */}
      {showAdvanced ? (
        <CollapsibleSection label="Advanced" defaultExpanded={false}>
          <View style={styles.advancedBody}>
            <AdvancedFields d={d} set={set} />
          </View>
        </CollapsibleSection>
      ) : null}

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Button label="Cancel" variant="ghost" onPress={onCancel} />
        <Button label="Save rule" variant="primary" onPress={() => onSave(d)} />
      </View>
    </ScrollView>
  );
}

const _pressedOverlay: ViewStyle = { opacity: 0.6 };
void _pressedOverlay;

function buildStyles(t: Theme) {
  return StyleSheet.create({
    body: {
      padding: t.spacing.lg,
      gap: t.spacing.md,
    },
    actionScroll: {
      paddingBottom: t.spacing.xs,
    },
    advancedBody: {
      padding: t.spacing.md,
      gap: t.spacing.lg,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: t.spacing.md,
      marginTop: t.spacing.md,
    },
  });
}
