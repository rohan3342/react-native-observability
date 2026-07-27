/**
 * Recursively merges a partial override into a complete base object.
 *
 * Used to apply a consumer's `theme` prop (a {@link PartialTheme}) over the
 * active default theme. Only plain object slots recurse; primitives and
 * arrays from the override replace the base value outright.
 *
 * Pure, allocation-free on miss: when the override is `undefined`, the
 * base is returned by identity.
 *
 * @internal
 */
export function deepMerge<T extends object>(base: T, override: DeepPartial<T> | undefined): T {
  if (override === undefined) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const key of Object.keys(override) as Array<keyof T>) {
    const ov = override[key];
    if (ov === undefined) continue;
    const baseVal = base[key];
    if (isPlainObject(baseVal) && isPlainObject(ov)) {
      out[key as string] = deepMerge(baseVal as object, ov as DeepPartial<object>);
    } else {
      out[key as string] = ov;
    }
  }
  return out as T;
}

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object
    ? T[K] extends ReadonlyArray<unknown>
      ? T[K]
      : DeepPartial<T[K]>
    : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
