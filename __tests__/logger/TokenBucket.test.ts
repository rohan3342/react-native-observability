import { TokenBucket, sampleByKey } from '../../src/logger/sampling/TokenBucket';

describe('TokenBucket', () => {
  it('allows up to `burst` immediately then blocks', () => {
    const b = new TokenBucket(1, 3, 0);
    expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(true);
    expect(b.tryRemove(0)).toBe(false); // bucket empty
  });

  it('refills over time at `perSecond`', () => {
    const b = new TokenBucket(2, 2, 0); // 2 tokens/sec, cap 2
    b.tryRemove(0);
    b.tryRemove(0);
    expect(b.tryRemove(0)).toBe(false);
    // 500ms later → +1 token
    expect(b.tryRemove(500)).toBe(true);
    expect(b.tryRemove(500)).toBe(false);
  });

  it('never exceeds the burst cap on refill', () => {
    const b = new TokenBucket(100, 2, 0);
    b.tryRemove(0);
    b.tryRemove(0);
    // a long idle period would over-refill an uncapped bucket
    expect(b.tryRemove(10_000)).toBe(true);
    expect(b.tryRemove(10_000)).toBe(true);
    expect(b.tryRemove(10_000)).toBe(false); // capped at 2
  });
});

describe('sampleByKey', () => {
  it('always keeps at rate >= 1 and always drops at rate <= 0', () => {
    expect(sampleByKey('anything', 1)).toBe(true);
    expect(sampleByKey('anything', 2)).toBe(true);
    expect(sampleByKey('anything', 0)).toBe(false);
    expect(sampleByKey('anything', -1)).toBe(false);
  });

  it('is deterministic for the same key', () => {
    const a = sampleByKey('stable-key', 0.5);
    const b = sampleByKey('stable-key', 0.5);
    expect(a).toBe(b);
  });

  it('keeps roughly `rate` fraction across many distinct keys', () => {
    let kept = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (sampleByKey(`key-${i}`, 0.3)) kept++;
    }
    const fraction = kept / n;
    // Loose bounds — just confirm it's in the right ballpark, not 0 or 1.
    expect(fraction).toBeGreaterThan(0.2);
    expect(fraction).toBeLessThan(0.4);
  });
});
