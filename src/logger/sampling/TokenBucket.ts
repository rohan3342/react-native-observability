/**
 * Token-bucket rate limiter (plan S7). Refills `perSecond` tokens per second up
 * to `burst` capacity; each allowed event consumes one token. Refill is lazy
 * (computed on `tryRemove`) so there is no timer — cheap and Hermes-safe.
 *
 * The caller supplies `now` (ms) so the bucket has no hidden dependency on
 * `Date.now()` and is deterministic in tests.
 */
export class TokenBucket {
  private readonly perSecond: number;
  private readonly burst: number;
  private tokens: number;
  private lastRefillMs: number;

  /**
   * @param perSecond - tokens replenished per second.
   * @param burst - maximum tokens held (bucket capacity). Starts full.
   * @param nowMs - initial timestamp.
   */
  constructor(perSecond: number, burst: number, nowMs: number) {
    this.perSecond = Math.max(0, perSecond);
    this.burst = Math.max(1, burst);
    this.tokens = this.burst;
    this.lastRefillMs = nowMs;
  }

  /**
   * Attempt to consume one token at time `nowMs`. Returns `true` if a token was
   * available (event allowed), `false` if rate-limited.
   */
  tryRemove(nowMs: number): boolean {
    this.refill(nowMs);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(nowMs: number): void {
    if (nowMs <= this.lastRefillMs) return;
    const elapsedSec = (nowMs - this.lastRefillMs) / 1000;
    this.tokens = Math.min(this.burst, this.tokens + elapsedSec * this.perSecond);
    this.lastRefillMs = nowMs;
  }
}

/**
 * Deterministic per-key sampler. Returns true with probability `rate` based on a
 * stable hash of `key`, so the same logical key is sampled consistently. Used
 * for head-based log sampling (plan S7).
 *
 * @param key - stable identifier (e.g. a per-event hash input).
 * @param rate - 0..1. `>= 1` always keeps, `<= 0` always drops.
 */
export function sampleByKey(key: string, rate: number): boolean {
  if (rate >= 1) return true;
  if (rate <= 0) return false;
  // FNV-1a 32-bit hash → [0,1).
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Map to unsigned then normalize.
  const normalized = (h >>> 0) / 0xffffffff;
  return normalized < rate;
}
