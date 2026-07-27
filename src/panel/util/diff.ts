/** One field-level change between two snapshots of a value. */
export interface ValueDiffEntry {
  readonly key: string;
  readonly kind: 'added' | 'removed' | 'changed';
  /** Compact preview of the previous value (absent for `added`). */
  readonly before?: string;
  /** Compact preview of the next value (absent for `removed`). */
  readonly after?: string;
}

/** Result of {@link diffValues}. `changed` is false when nothing differs. */
export interface ValueDiff {
  readonly changed: boolean;
  readonly entries: readonly ValueDiffEntry[];
}

function preview(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'function') return '<function>';
  if (type === 'symbol') return (value as symbol).toString();
  try {
    const s = JSON.stringify(value);
    return s.length > 80 ? `${s.slice(0, 79)}…` : s;
  } catch {
    return Array.isArray(value) ? `Array(${value.length})` : '{…}';
  }
}

/** Stable equality used for change detection — JSON-shape equality, circular-safe. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false; // non-serializable (circular / fn) — treat as changed
  }
}

/**
 * Computes a shallow, top-level key diff between two snapshots of an object —
 * which keys were added, removed, or changed. Powers the State tab's per-slice
 * "snapshot & diff" view (what changed since the captured snapshot). For
 * non-object values, reports a single synthetic `changed` entry when they
 * differ. Pure; never throws.
 */
export function diffValues(prev: unknown, next: unknown): ValueDiff {
  const bothObjects =
    prev !== null &&
    next !== null &&
    typeof prev === 'object' &&
    typeof next === 'object' &&
    !Array.isArray(prev) &&
    !Array.isArray(next);

  if (!bothObjects) {
    if (sameValue(prev, next)) return { changed: false, entries: [] };
    return {
      changed: true,
      entries: [{ key: '(value)', kind: 'changed', before: preview(prev), after: preview(next) }],
    };
  }

  const a = prev as Record<string, unknown>;
  const b = next as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const entries: ValueDiffEntry[] = [];

  for (const key of [...keys].sort()) {
    const inA = key in a;
    const inB = key in b;
    if (inA && !inB) {
      entries.push({ key, kind: 'removed', before: preview(a[key]) });
    } else if (!inA && inB) {
      entries.push({ key, kind: 'added', after: preview(b[key]) });
    } else if (!sameValue(a[key], b[key])) {
      entries.push({ key, kind: 'changed', before: preview(a[key]), after: preview(b[key]) });
    }
  }

  return { changed: entries.length > 0, entries };
}
