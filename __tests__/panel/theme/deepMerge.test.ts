import { deepMerge } from '../../../src/panel/theme/deepMerge';

describe('deepMerge', () => {
  it('returns base by identity when override is undefined', () => {
    const base = { a: 1, b: { c: 2 } };
    expect(deepMerge(base, undefined)).toBe(base);
  });

  it('replaces primitive leaves', () => {
    const base = { a: 1, b: 2 };
    const out = deepMerge(base, { a: 99 });
    expect(out).toEqual({ a: 99, b: 2 });
  });

  it('recurses into nested objects', () => {
    const base = { colors: { accent: '#0a7aff', text: '#000' } };
    const out = deepMerge(base, { colors: { accent: '#ff0000' } });
    expect(out).toEqual({ colors: { accent: '#ff0000', text: '#000' } });
  });

  it('ignores undefined values in the override', () => {
    const base = { a: 1, b: 2 };
    const override = { a: undefined } as unknown as { a?: number };
    const out = deepMerge(base, override);
    expect(out).toEqual({ a: 1, b: 2 });
  });

  it('does not mutate the base object', () => {
    const base = { colors: { accent: '#000' } };
    deepMerge(base, { colors: { accent: '#fff' } });
    expect(base.colors.accent).toBe('#000');
  });

  it('replaces arrays wholesale (no element-wise merge)', () => {
    const base = { list: [1, 2, 3] as readonly number[] };
    const out = deepMerge(base, { list: [9] as readonly number[] });
    expect(out.list).toEqual([9]);
  });

  it('preserves deeply nested fields when only one branch is overridden', () => {
    const base = {
      colors: {
        logLevel: { debug: '#aaa', info: '#0a0', warn: '#a80', error: '#a00' },
      },
    };
    const out = deepMerge(base, { colors: { logLevel: { warn: '#ff0' } } });
    expect(out.colors.logLevel).toEqual({
      debug: '#aaa',
      info: '#0a0',
      warn: '#ff0',
      error: '#a00',
    });
  });
});
