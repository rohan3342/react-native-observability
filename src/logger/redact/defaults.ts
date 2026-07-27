/**
 * Default-on value-pattern redactors. These run against every string value in a
 * context tree unless explicitly disabled via `RedactConfig.valuePatterns`.
 *
 * Patterns are written to avoid catastrophic backtracking (no nested quantifiers
 * over overlapping character classes) so they are safe to run on adversarial
 * input in the logger hot path.
 */

/**
 * Email addresses. Permissive on the local part, conservative on the domain
 * (one or more dot-separated labels) so we catch real addresses without misfiring
 * on, e.g., `a@b`.
 *
 * **Every quantifier is length-bounded** (`{1,64}` local, `{1,63}` per label per
 * RFC 5321, up to 8 labels). Bounded quantifiers give the engine a finite, small
 * search space, so an adversarial `@`-containing run (e.g. 100k chars with no
 * qualifying dot) fails in linear time instead of backtracking for seconds — the
 * unbounded `[\w.+-]+@[\w-]+\.[\w.-]+` form was ReDoS-able on the synchronous
 * `Logger.write` hot path, and even an "anchored-label" `(?:\.[\w-]+)+` rewrite
 * stayed quadratic because the unbounded local/label `+` still backtracks. See
 * the ReDoS regression test in `deepRedact.test.ts`. (Security: SEC-1.)
 */
export const EMAIL_PATTERN = /[\w.+-]{1,64}@[\w-]{1,63}(?:\.[\w-]{1,63}){1,8}/g;

/**
 * JSON Web Tokens — three base64url segments separated by dots, the first
 * starting with the canonical `eyJ` (`{"` base64url-encoded) header marker.
 */
export const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/**
 * Candidate credit-card numbers: 13–19 digit runs, optionally grouped by single
 * spaces or hyphens. A Luhn check (see {@link looksLikeCreditCard}) gates the
 * actual redaction so long order ids / phone numbers are not falsely scrubbed.
 */
export const CREDIT_CARD_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;

/** Luhn checksum — returns true when `digits` (already stripped) passes. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48; // '0' === 48
    if (n < 0 || n > 9) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Returns true when `candidate` (a matched digit run, possibly with separators)
 * is 13–19 digits long and passes the Luhn checksum.
 */
export function looksLikeCreditCard(candidate: string): boolean {
  const digits = candidate.replace(/[ -]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  return luhnValid(digits);
}

/** Which value-pattern redactors are enabled. */
export interface ValuePatternFlags {
  email: boolean;
  jwt: boolean;
  creditCard: boolean;
  custom: readonly RegExp[];
}

/**
 * Applies the enabled value-pattern redactors to a single string. Returns the
 * (possibly) scrubbed string. Replacement is the caller's `[REDACTED]` token.
 */
export function redactValuePatterns(
  input: string,
  flags: ValuePatternFlags,
  replacement: string
): string {
  let out = input;

  if (flags.jwt) {
    // JWT before email: a JWT can contain `@`-free text but never the reverse;
    // scrubbing it first avoids partial overlaps.
    out = out.replace(JWT_PATTERN, replacement);
  }
  if (flags.email) {
    out = out.replace(EMAIL_PATTERN, replacement);
  }
  if (flags.creditCard) {
    out = out.replace(CREDIT_CARD_CANDIDATE, m => (looksLikeCreditCard(m) ? replacement : m));
  }
  for (const re of flags.custom) {
    // Reset lastIndex defensively in case a global custom regex is reused.
    re.lastIndex = 0;
    out = out.replace(re, replacement);
  }

  return out;
}
