/**
 * Schema envelope used for every persisted JSON value.
 *
 * Wrapping payloads as `{ v: 1, payload: ... }` lets the library evolve the
 * stored shape over time without silently corrupting old sessions on upgrade.
 * Reads dispatch through a migration table (see {@link MIGRATIONS}). Unknown
 * versions are quarantined rather than thrown — a library that persists user
 * data must never crash the host app on read.
 *
 * Plan reference: DR-4.
 */

/** Current schema version. Bump when the serialized shape changes. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Envelope wrapping every persisted JSON value. */
export interface SchemaEnvelope<TPayload> {
  readonly v: number;
  readonly payload: TPayload;
}

/**
 * Wrap a payload in the current envelope.
 */
export function wrap<TPayload>(payload: TPayload): SchemaEnvelope<TPayload> {
  return { v: CURRENT_SCHEMA_VERSION, payload };
}

/**
 * Serialize a payload to JSON with the envelope.
 */
export function serialize<TPayload>(payload: TPayload): string {
  return JSON.stringify(wrap(payload));
}

/**
 * Migration table — keyed by source version, transforms raw payload to the
 * current shape. Identity at v1 because nothing has migrated yet.
 *
 * To introduce a v2 schema, raise {@link CURRENT_SCHEMA_VERSION}, add a `2`
 * entry whose function transforms a v1 payload into the new shape, and keep
 * the `1` entry unchanged.
 */
const MIGRATIONS: Record<number, (raw: unknown) => unknown> = {
  1: raw => raw,
};

/** Result of attempting to read a persisted envelope. */
export type ReadResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { ok: false; reason: 'unknown-version' | 'parse-error' | 'shape-error'; raw?: string };

/**
 * Parse a JSON string into an envelope and apply migrations to bring the
 * payload up to the current version. Never throws — returns a tagged
 * {@link ReadResult} so callers can choose to quarantine, default, or warn.
 */
export function deserialize<TPayload>(raw: string): ReadResult<TPayload> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'parse-error', raw };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'shape-error', raw };
  }

  const env = parsed as { v?: unknown; payload?: unknown };
  if (typeof env.v !== 'number' || !('payload' in env)) {
    return { ok: false, reason: 'shape-error', raw };
  }

  const migration = MIGRATIONS[env.v];
  if (migration === undefined) {
    return { ok: false, reason: 'unknown-version', raw };
  }

  return { ok: true, payload: migration(env.payload) as TPayload };
}
