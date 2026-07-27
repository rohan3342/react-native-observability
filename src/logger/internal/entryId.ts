/**
 * Stable, monotonic log-entry id generation (plan S17 / OQ-2).
 *
 * The original scheme (`${Date.now()}-${Math.random()}`) had two defects that
 * broke deterministic sampling:
 *
 *  1. **Non-deterministic across runs.** Sampling hashes the entry id
 *     (`sampleByKey`), so the same logical event hashed to a different bucket on
 *     every launch — "keep 10% of DEBUG" was random per run rather than a stable
 *     decision a developer could reason about or reproduce.
 *  2. **Non-monotonic under clock skew.** `Date.now()` can move backwards (NTP
 *     correction), so ids were not reliably ordered.
 *
 * This module replaces it with `${bootId}-${seq}`:
 *
 *  - `bootId` — a short, per-process random token computed **once** at module
 *    load. Distinguishes ids from different app launches so they never collide,
 *    without re-seeding randomness on the hot path.
 *  - `seq` — a strictly monotonic counter incremented per entry. Ordering is
 *    guaranteed regardless of wall-clock behaviour.
 *
 * The id is therefore deterministic **within** a run (a given seq always
 * produces the same id) and the sampling decision for entry N is reproducible
 * if the boot id is known — enough to make `sampleByKey` reason-about-able.
 * (A fully cross-run-stable scheme would require the caller to supply a logical
 * event key; that remains a future option, but is out of scope here.)
 *
 * @internal
 */

/**
 * Per-process boot token. Computed once at module load — NOT on the hot path —
 * so generating an id is a single integer increment plus a string concat.
 */
const BOOT_ID = Math.random().toString(36).slice(2, 8);

let seq = 0;

/**
 * Returns the next monotonic entry id for this process: `${bootId}-${seq}`.
 * Cheap (one increment, one concat) and ordered.
 */
export function nextEntryId(): string {
  return `${BOOT_ID}-${seq++}`;
}

/**
 * Resets the sequence counter. Test-only — lets a suite assert deterministic
 * ids without depending on prior tests' counter state.
 *
 * @internal
 */
export function _resetEntryIdSeq(): void {
  seq = 0;
}
