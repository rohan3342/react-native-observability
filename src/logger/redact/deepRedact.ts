import { redactValuePatterns, type ValuePatternFlags } from './defaults';

/**
 * Resolved, internal redaction settings. Produced once from a user
 * `RedactConfig` (see {@link resolveRedactConfig}) and reused for every entry so
 * the hot path does no option-parsing.
 */
export interface ResolvedRedact {
  /** Compiled key matchers. A path matches if any matcher matches it. */
  readonly keyMatchers: readonly KeyMatcher[];
  readonly valuePatterns: ValuePatternFlags;
  readonly replacement: string;
  readonly mode: 'replace' | 'omit';
  readonly maxDepth: number;
  /** True when nothing is configured AND all value patterns are off — skip work. */
  readonly isNoop: boolean;
}

/**
 * A compiled key path matcher. `segments` is the glob split on `.`; `*` matches
 * exactly one path segment, `**` matches any number (including zero).
 */
interface KeyMatcher {
  readonly segments: readonly string[];
}

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_REPLACEMENT = '[REDACTED]';

/** Compile a dot/glob key string (e.g. `'user.email'`, `'*.password'`) into a matcher. */
function compileKey(key: string): KeyMatcher {
  return { segments: key.split('.') };
}

/**
 * Does `pathSegments` (the path to a value, e.g. `['user','email']`) match the
 * compiled `matcher`? Supports `*` (one segment) and `**` (any run).
 */
function pathMatches(pathSegments: readonly string[], matcher: KeyMatcher): boolean {
  const pat = matcher.segments;

  // Iterative glob match with `**` support, O(n*m) worst case, no backtracking
  // blow-up because we memoize the frontier of reachable pattern indices.
  let frontier = new Set<number>([0]);
  for (const seg of pathSegments) {
    const next = new Set<number>();
    for (const pi of frontier) {
      if (pi >= pat.length) continue;
      const token = pat[pi];
      if (token === '**') {
        // `**` can consume this segment (stay at pi) or skip to pi+1.
        next.add(pi);
        next.add(pi + 1);
        // Also let `**` match zero segments at the same position chain.
      } else if (token === '*' || token === seg) {
        next.add(pi + 1);
      }
    }
    // Allow a `**` to also match the *next* token without consuming a segment.
    for (const pi of [...next]) {
      if (pat[pi] === '**') next.add(pi + 1);
    }
    frontier = next;
    if (frontier.size === 0) return false;
  }
  // Match if any reachable index is at the end (allowing trailing `**`).
  for (const pi of frontier) {
    if (pi === pat.length) return true;
    if (pi === pat.length - 1 && pat[pi] === '**') return true;
  }
  return false;
}

function keyHit(pathSegments: readonly string[], matchers: readonly KeyMatcher[]): boolean {
  for (const m of matchers) {
    if (pathMatches(pathSegments, m)) return true;
  }
  return false;
}

/**
 * Recursively redact `value`. Replaces values whose path matches a key glob and
 * scrubs value patterns (email/JWT/CC/custom) from every string. Bounded by
 * `maxDepth`; circular references are broken with a `[Circular]` marker.
 */
function redactNode(
  value: unknown,
  path: string[],
  cfg: ResolvedRedact,
  depth: number,
  seen: WeakSet<object>
): unknown {
  // Key-path redaction takes precedence over value scrubbing.
  if (path.length > 0 && keyHit(path, cfg.keyMatchers)) {
    return cfg.replacement;
  }

  if (typeof value === 'string') {
    return redactValuePatterns(value, cfg.valuePatterns, cfg.replacement);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (depth >= cfg.maxDepth) {
    // Stop descending — keep the reference shape but don't recurse further.
    return Array.isArray(value) ? '[Array]' : '[Object]';
  }

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  let result: unknown;
  if (Array.isArray(value)) {
    result = value.map((item, i) => redactNode(item, [...path, String(i)], cfg, depth + 1, seen));
  } else {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const childPath = [...path, k];
      if (cfg.mode === 'omit' && keyHit(childPath, cfg.keyMatchers)) {
        continue; // drop the key entirely
      }
      out[k] = redactNode(v, childPath, cfg, depth + 1, seen);
    }
    result = out;
  }

  seen.delete(value);
  return result;
}

/**
 * The public `RedactConfig` shape (re-declared here to avoid a circular import
 * with `../types`). Kept structurally identical.
 */
export interface RedactConfigInput {
  keys?: string[];
  valuePatterns?: {
    email?: boolean;
    jwt?: boolean;
    creditCard?: boolean;
    custom?: RegExp[];
  };
  replacement?: string;
  mode?: 'replace' | 'omit';
  maxDepth?: number;
}

/**
 * Resolve a user `RedactConfig` (object or `string[]` shorthand) into the
 * internal {@link ResolvedRedact} used on the hot path. Value-pattern redactors
 * (email / JWT / credit-card) are **ON by default** — pass
 * `valuePatterns: { email: false, jwt: false, creditCard: false }` to disable.
 */
export function resolveRedactConfig(
  redact: string[] | RedactConfigInput | undefined
): ResolvedRedact {
  const cfg: RedactConfigInput = Array.isArray(redact) ? { keys: redact } : (redact ?? {});

  const vp = cfg.valuePatterns ?? {};
  const valuePatterns: ValuePatternFlags = {
    email: vp.email ?? true,
    jwt: vp.jwt ?? true,
    creditCard: vp.creditCard ?? true,
    custom: vp.custom ?? [],
  };

  const keyMatchers = (cfg.keys ?? []).map(compileKey);

  const isNoop =
    keyMatchers.length === 0 &&
    !valuePatterns.email &&
    !valuePatterns.jwt &&
    !valuePatterns.creditCard &&
    valuePatterns.custom.length === 0;

  return {
    keyMatchers,
    valuePatterns,
    replacement: cfg.replacement ?? DEFAULT_REPLACEMENT,
    mode: cfg.mode ?? 'replace',
    maxDepth: cfg.maxDepth ?? DEFAULT_MAX_DEPTH,
    isNoop,
  };
}

/**
 * Scrub value patterns (email / JWT / credit-card / custom) from a bare string.
 *
 * Unlike {@link deepRedact}, there is no key-path context — this is for free-text
 * that is not part of an object tree: a log `message`, an `error.message`, or a
 * raw (non-JSON) HTTP body. Key-glob matchers (`bodyKeys` / `keys`) cannot apply
 * to an opaque string, so only the value patterns run. Returns the input
 * unchanged when the resolved config is a no-op.
 *
 * @example
 * ```ts
 * const cfg = resolveRedactConfig(undefined); // value patterns on by default
 * redactString('token for ada@example.com', cfg); // → 'token for [REDACTED]'
 * ```
 */
export function redactString(text: string, cfg: ResolvedRedact): string {
  if (cfg.isNoop) return text;
  return redactValuePatterns(text, cfg.valuePatterns, cfg.replacement);
}

/**
 * Deep-redact a context object. Returns a new object; the input is never
 * mutated. When the resolved config is a no-op, returns the input unchanged.
 *
 * @example
 * ```ts
 * const cfg = resolveRedactConfig({ keys: ['*.password'] });
 * deepRedact({ user: { email: 'a@b.com', password: 'p' } }, cfg);
 * // → { user: { email: '[REDACTED]', password: '[REDACTED]' } }
 * ```
 */
export function deepRedact(
  context: Record<string, unknown>,
  cfg: ResolvedRedact
): Record<string, unknown> {
  if (cfg.isNoop) return context;
  return redactNode(context, [], cfg, 0, new WeakSet()) as Record<string, unknown>;
}
