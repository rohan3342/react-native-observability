import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';
import { AnimatedChevron } from './AnimatedChevron';

export interface JsonTreeProps {
  /** Any JS value — object, array, or primitive. */
  readonly data: unknown;
  /**
   * Depth that starts expanded. `0` (default) expands only the root container;
   * deeper containers render collapsed with a `{n keys}` / `[n]` preview the
   * user taps to drill in. Keeps a large object from rendering its whole tree.
   */
  readonly initialExpandDepth?: number;
}

/** Classification used to colour a leaf value and decide if it's expandable. */
type ValueKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' | 'other';

function kindOf(value: unknown): ValueKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const t = typeof value;
  if (t === 'object') return 'object';
  if (t === 'string') return 'string';
  if (t === 'number' || t === 'bigint') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'other'; // function, symbol, undefined
}

const MAX_STRING = 200;

/**
 * A collapsible JSON tree viewer (devtools-style) for the debug panel's network
 * bodies and State slices. Objects and arrays are expandable nodes; primitives
 * render inline with type-based colouring. Circular references, BigInts,
 * functions, and symbols are rendered safely (never throws).
 *
 * Only the root container is expanded by default (`initialExpandDepth`),
 * so a large/deep payload stays scannable instead of rendering every node.
 */
export function JsonTree({ data, initialExpandDepth = 0 }: JsonTreeProps): React.ReactElement {
  return (
    <View>
      <JsonNode
        label={null}
        value={data}
        depth={0}
        initialExpandDepth={initialExpandDepth}
        ancestors={EMPTY_ANCESTORS}
      />
    </View>
  );
}

const EMPTY_ANCESTORS: readonly object[] = [];

interface JsonNodeProps {
  /** The key/index this node sits under, or `null` for the root. */
  readonly label: string | null;
  readonly value: unknown;
  readonly depth: number;
  readonly initialExpandDepth: number;
  /** Ancestor containers on the path to this node — used to break cycles. */
  readonly ancestors: readonly object[];
}

function JsonNode({
  label,
  value,
  depth,
  initialExpandDepth,
  ancestors,
}: JsonNodeProps): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const kind = kindOf(value);
  const expandable = kind === 'object' || kind === 'array';

  // Circular guard — show a placeholder leaf instead of recursing forever.
  const circular = expandable && ancestors.includes(value as object);

  const [expanded, setExpanded] = useState(depth <= initialExpandDepth);

  const indent = { paddingLeft: depth === 0 ? 0 : t.spacing.lg };

  if (!expandable || circular) {
    return (
      <View style={[styles.leaf, indent]}>
        {label !== null ? <KeyText label={label} /> : null}
        <TextX mono variant="body" style={[styles.value, { color: leafColor(t, kind) }]}>
          {circular ? '<circular>' : leafText(value, kind)}
        </TextX>
      </View>
    );
  }

  const entries: Array<[string, unknown]> = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;

  const nextAncestors = [...ancestors, value as object];

  return (
    <View style={indent}>
      <Pressable
        onPress={() => setExpanded(e => !e)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${label ?? 'root'}, ${summary}, ${expanded ? 'expanded' : 'collapsed'}`}
        style={({ pressed }) => [styles.nodeHeader, pressed && pressedOverlay]}
      >
        <AnimatedChevron expanded={expanded} style={styles.caret} />
        {label !== null ? <KeyText label={label} /> : null}
        <TextX mono variant="caption" tone="subtle" style={styles.summary}>
          {summary}
        </TextX>
      </Pressable>
      {expanded ? (
        <View>
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              label={k}
              value={v}
              depth={depth + 1}
              initialExpandDepth={initialExpandDepth}
              ancestors={nextAncestors}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function KeyText({ label }: { label: string }): React.ReactElement {
  const t = useTheme();
  return (
    <TextX mono variant="body" tone="accent" style={{ marginRight: t.spacing.sm }}>
      {label}:
    </TextX>
  );
}

// ─── Leaf rendering ─────────────────────────────────────────────────────────

function leafColor(t: Theme, kind: ValueKind): string {
  switch (kind) {
    case 'string':
      return t.colors.success;
    case 'number':
      return t.colors.accent;
    case 'boolean':
      return t.colors.warning;
    case 'null':
    case 'other':
      return t.colors.textSubtle;
    default:
      return t.colors.text;
  }
}

function leafText(value: unknown, kind: ValueKind): string {
  switch (kind) {
    case 'string': {
      const s = value as string;
      const truncated = s.length > MAX_STRING ? `${s.slice(0, MAX_STRING)}…` : s;
      return `"${truncated}"`;
    }
    case 'number':
      return typeof value === 'bigint' ? `${value.toString()}n` : String(value);
    case 'boolean':
      return String(value);
    case 'null':
      return 'null';
    case 'other':
      if (typeof value === 'function') return '<function>';
      if (typeof value === 'symbol') return value.toString();
      return 'undefined';
    default:
      return String(value);
  }
}

const pressedOverlay: ViewStyle = { opacity: 0.6 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    nodeHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
    caret: { fontSize: 11, width: 14 },
    summary: { marginLeft: t.spacing.xs },
    leaf: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 2 },
    value: { flexShrink: 1 },
  });
}
