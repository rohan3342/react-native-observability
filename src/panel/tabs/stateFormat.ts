import type { KeyValueRow } from '../components/KeyValueRows';

/**
 * Full, safe stringify for the copy payload + primitive display. Handles
 * circular references, BigInts, functions, and symbols without throwing.
 */
export function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_, v: unknown): unknown => {
        if (typeof v === 'bigint') return `<bigint:${v.toString()}>`;
        if (typeof v === 'function') return '<function>';
        if (typeof v === 'symbol') return v.toString();
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '<circular>';
          seen.add(v);
        }
        return v;
      },
      2
    );
  } catch (err) {
    return `<serialize error: ${err instanceof Error ? err.message : String(err)}>`;
  }
}

/**
 * A compact, single-line preview of a value for a key→value row — so a large
 * state object renders one scannable line per key instead of a multi-line dump.
 * Arrays/objects are summarised by length/shape; long strings are truncated.
 */
export function previewValue(value: unknown, maxLen = 80): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const type = typeof value;
  if (type === 'string') return truncate(JSON.stringify(value), maxLen);
  if (type === 'number' || type === 'boolean' || type === 'bigint') return String(value);
  if (type === 'function') return '<function>';
  if (type === 'symbol') return (value as symbol).toString();
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return truncate(safeInline(value), maxLen, `Array(${value.length})`);
  }
  // plain object
  const keys = Object.keys(value as object);
  if (keys.length === 0) return '{}';
  return truncate(safeInline(value), maxLen, `{${keys.length} keys}`);
}

/**
 * Returns a `KeyValueRow[]` for a plain-object slice (one row per top-level
 * key, value compacted via {@link previewValue}), or `null` when the value is
 * not a plain object (caller falls back to a full stringify). Lets the State
 * tab show a tidy key list for big stores instead of a giant JSON blob.
 */
export function objectRows(value: unknown): KeyValueRow[] | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return null;
  return keys.map(key => ({ key, value: previewValue(obj[key]) }));
}

/**
 * True when a value is worth rendering as a drillable {@link JsonTree} (a plain
 * object or array). Primitives render as plain text instead.
 */
export function isTreeValue(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

/** Top-level key/element count for a tree value, or `undefined` otherwise. */
export function topLevelCount(value: unknown): number | undefined {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return undefined;
}

/**
 * A shape-only preview for a collapsed State card — shows structure (key names
 * for objects, length for arrays) but **never values**, so the collapsed header
 * is scannable without leaking the slice's data (it stays hidden until the card
 * is expanded). Primitives show their type, not their value.
 */
export function shapePreview(value: unknown, maxKeys = 4): string {
  if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.length}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as object);
    if (keys.length === 0) return '{}';
    const shown = keys.slice(0, maxKeys).join(', ');
    const more = keys.length > maxKeys ? `, +${keys.length - maxKeys}` : '';
    return `{ ${shown}${more} }`;
  }
  // Primitives: show the type, not the value (no leak in the collapsed header).
  return valueType(value);
}

/** Short type tag for a slice value — drives the State card's type badge. */
export type ValueType = 'obj' | 'arr' | 'str' | 'num' | 'bool' | 'null' | 'fn' | 'undef' | 'other';

/** Classifies a value into a short type tag. */
export function valueType(value: unknown): ValueType {
  if (value === null) return 'null';
  if (value === undefined) return 'undef';
  if (Array.isArray(value)) return 'arr';
  const t = typeof value;
  if (t === 'object') return 'obj';
  if (t === 'string') return 'str';
  if (t === 'number' || t === 'bigint') return 'num';
  if (t === 'boolean') return 'bool';
  if (t === 'function') return 'fn';
  return 'other';
}

function safeInline(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return Array.isArray(value) ? `Array(${value.length})` : '{…}';
  }
}

function truncate(s: string, maxLen: number, fallback?: string): string {
  if (s.length <= maxLen) return s;
  if (fallback !== undefined) return fallback;
  return `${s.slice(0, maxLen - 1)}…`;
}
