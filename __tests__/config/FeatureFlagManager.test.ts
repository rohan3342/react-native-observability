import { FeatureFlagManager } from '../../src/config/FeatureFlagManager';

afterEach(() => {
  FeatureFlagManager.reset();
});

describe('FeatureFlagManager — isEnabled', () => {
  it('returns false for an unknown key (safe default)', () => {
    expect(FeatureFlagManager.isEnabled('unknown_flag')).toBe(false);
  });

  it('returns the seeded value when flag is enabled', () => {
    FeatureFlagManager.init({ new_ui: true });
    expect(FeatureFlagManager.isEnabled('new_ui')).toBe(true);
  });

  it('returns the seeded value when flag is disabled', () => {
    FeatureFlagManager.init({ dark_mode: false });
    expect(FeatureFlagManager.isEnabled('dark_mode')).toBe(false);
  });
});

describe('FeatureFlagManager — init', () => {
  it('replaces previously seeded flags on re-init', () => {
    FeatureFlagManager.init({ flag_a: true });
    FeatureFlagManager.init({ flag_b: true });

    expect(FeatureFlagManager.isEnabled('flag_a')).toBe(false); // replaced
    expect(FeatureFlagManager.isEnabled('flag_b')).toBe(true);
  });

  it('handles an empty flags object', () => {
    FeatureFlagManager.init({});
    expect(FeatureFlagManager.isEnabled('any')).toBe(false);
  });
});

describe('FeatureFlagManager — override', () => {
  it('override takes precedence over seeded value', () => {
    FeatureFlagManager.init({ my_flag: false });
    FeatureFlagManager.override('my_flag', true);

    expect(FeatureFlagManager.isEnabled('my_flag')).toBe(true);
  });

  it('override works on a key that was never seeded', () => {
    FeatureFlagManager.override('unseen_flag', true);
    expect(FeatureFlagManager.isEnabled('unseen_flag')).toBe(true);
  });

  it('override can disable a previously enabled flag', () => {
    FeatureFlagManager.init({ my_flag: true });
    FeatureFlagManager.override('my_flag', false);

    expect(FeatureFlagManager.isEnabled('my_flag')).toBe(false);
  });

  it('a second override for the same key replaces the first', () => {
    FeatureFlagManager.override('x', true);
    FeatureFlagManager.override('x', false);

    expect(FeatureFlagManager.isEnabled('x')).toBe(false);
  });
});

describe('FeatureFlagManager — hasOverride / clearOverride', () => {
  it('hasOverride returns true after override()', () => {
    FeatureFlagManager.override('x', true);
    expect(FeatureFlagManager.hasOverride('x')).toBe(true);
  });

  it('hasOverride returns false for a seeded-only flag', () => {
    FeatureFlagManager.init({ y: true });
    expect(FeatureFlagManager.hasOverride('y')).toBe(false);
  });

  it('clearOverride removes the override and restores the seeded value', () => {
    FeatureFlagManager.init({ flag: true });
    FeatureFlagManager.override('flag', false);
    expect(FeatureFlagManager.isEnabled('flag')).toBe(false);

    FeatureFlagManager.clearOverride('flag');
    expect(FeatureFlagManager.hasOverride('flag')).toBe(false);
    expect(FeatureFlagManager.isEnabled('flag')).toBe(true);
  });

  it('clearOverride is a no-op for keys with no override', () => {
    expect(() => FeatureFlagManager.clearOverride('never_set')).not.toThrow();
  });
});

describe('FeatureFlagManager — getKnownFlags', () => {
  it('returns the union of seeded and overridden keys, sorted', () => {
    FeatureFlagManager.init({ alpha: true, beta: false });
    FeatureFlagManager.override('gamma', true);
    FeatureFlagManager.override('alpha', false); // also overridden

    expect(FeatureFlagManager.getKnownFlags()).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns [] when nothing has been seeded or overridden', () => {
    expect(FeatureFlagManager.getKnownFlags()).toEqual([]);
  });

  it('does not duplicate keys that are both seeded and overridden', () => {
    FeatureFlagManager.init({ x: true });
    FeatureFlagManager.override('x', false);
    expect(FeatureFlagManager.getKnownFlags()).toEqual(['x']);
  });
});

describe('FeatureFlagManager — reset', () => {
  it('clears seeded flags', () => {
    FeatureFlagManager.init({ my_flag: true });
    FeatureFlagManager.reset();

    expect(FeatureFlagManager.isEnabled('my_flag')).toBe(false);
  });

  it('clears overrides', () => {
    FeatureFlagManager.override('my_flag', true);
    FeatureFlagManager.reset();

    expect(FeatureFlagManager.isEnabled('my_flag')).toBe(false);
  });

  it('allows init() to be called again after reset', () => {
    FeatureFlagManager.init({ a: true });
    FeatureFlagManager.reset();
    FeatureFlagManager.init({ b: true });

    expect(FeatureFlagManager.isEnabled('a')).toBe(false);
    expect(FeatureFlagManager.isEnabled('b')).toBe(true);
  });
});
