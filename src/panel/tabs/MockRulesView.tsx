import React, { useCallback, useMemo, useReducer, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { MockEngine, MockRule } from '../../integrations/http';
import { EmptyState } from '../components/EmptyState';
import { Badge } from '../components/ListRow';
import { PressableScale } from '../components/PressableScale';
import { Button, TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { Icon } from '../icons';
import { actionColor, draftToRule, emptyDraft, ruleToDraft, summarise } from './ruleDraft';
import type { RuleDraft } from './ruleDraft';
import { RuleEditor } from './RuleEditor';

// Re-export so NetworkTab and tests can still import from this module without
// touching their import paths.
export type { RuleDraft };
export { draftFromEntry } from './ruleDraft';

// ─── List view ────────────────────────────────────────────────────────────────

/**
 * The Network tab's "Rules" view — list, toggle, add, edit, and delete mock
 * rules backed by the consumer's {@link MockEngine}. Edits affect live requests
 * immediately (the same engine instance the observer shims consult). Tapping a
 * rule (or "+ Add rule") opens the full-screen {@link RuleEditor}.
 */
export function MockRulesView({
  engine,
  initialDraft,
  onDraftConsumed,
}: {
  engine: MockEngine;
  /** Pre-fill the editor (e.g. from a "Mock this" action). Opens the editor. */
  initialDraft?: RuleDraft | null;
  onDraftConsumed?: () => void;
}): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [, refresh] = useReducer((x: number) => x + 1, 0);
  const [editing, setEditing] = useState<RuleDraft | null>(initialDraft ?? null);

  // Adopt an externally-supplied draft ("Mock this") once.
  const lastInitial = React.useRef<RuleDraft | null>(null);
  if (initialDraft != null && initialDraft !== lastInitial.current) {
    lastInitial.current = initialDraft;
    if (editing === null) setEditing(initialDraft);
  }

  const rules = engine.getRules();

  const onToggle = useCallback(
    (rule: MockRule, next: boolean) => {
      engine.updateRule(rule.id, { enabled: next });
      refresh();
    },
    [engine]
  );
  const onDelete = useCallback(
    (rule: MockRule) => {
      engine.removeRule(rule.id);
      refresh();
    },
    [engine]
  );
  const onSave = useCallback(
    (draft: RuleDraft) => {
      const rule = draftToRule(draft);
      if (engine.getRules().some(r => r.id === rule.id)) engine.updateRule(rule.id, rule);
      else engine.addRule(rule);
      setEditing(null);
      onDraftConsumed?.();
      refresh();
    },
    [engine, onDraftConsumed]
  );
  const onCancel = useCallback(() => {
    setEditing(null);
    onDraftConsumed?.();
  }, [onDraftConsumed]);

  if (editing !== null) {
    return <RuleEditor draft={editing} onSave={onSave} onCancel={onCancel} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Button label="+ Add rule" variant="primary" onPress={() => setEditing(emptyDraft())} />
      {rules.length === 0 ? (
        <EmptyState
          title="No mock rules"
          hint="Add a rule to block, respond, modify a request/response, or inject a fault. Rules apply to live requests immediately."
        />
      ) : (
        rules.map(rule => (
          <View key={rule.id} style={styles.ruleCard}>
            <Switch
              value={rule.enabled !== false}
              onValueChange={n => onToggle(rule, n)}
              accessibilityRole="switch"
              accessibilityLabel={`Rule ${rule.id} enabled`}
              accessibilityState={{ checked: rule.enabled !== false }}
            />
            <PressableScale
              style={styles.ruleMain}
              accessibilityRole="button"
              accessibilityLabel={`Edit rule ${rule.id}`}
              accessibilityHint="Opens the rule editor"
              onPress={() => setEditing(ruleToDraft(rule))}
            >
              <View style={styles.ruleTitleLine}>
                <Badge label={rule.action.type} color={actionColor(t, rule.action.type)} />
                <TextX variant="body" mono numberOfLines={1} style={styles.ruleSummary}>
                  {summarise(rule)}
                </TextX>
              </View>
              <TextX variant="caption" tone="muted" numberOfLines={1}>
                {rule.id}
              </TextX>
            </PressableScale>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete rule ${rule.id}`}
              accessibilityHint="Removes this mock rule immediately"
              onPress={() => onDelete(rule)}
              hitSlop={t.hitSlop.loose}
              style={({ pressed }) => [styles.deleteBtn, pressed && pressedOverlay]}
            >
              <Icon name="close" size="sm" tone="danger" decorative />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.6 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    body: { padding: t.spacing.lg, gap: t.spacing.md },
    ruleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: t.spacing.md,
      padding: t.spacing.md,
      borderRadius: t.radii.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
      backgroundColor: t.colors.surfaceSubtle,
    },
    ruleMain: { flex: 1, gap: 2 },
    ruleTitleLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
    ruleSummary: { flex: 1 },
    deleteBtn: { padding: t.spacing.sm },
  });
}
