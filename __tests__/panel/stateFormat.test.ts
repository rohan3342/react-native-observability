import {
  isTreeValue,
  objectRows,
  previewValue,
  safeStringify,
  shapePreview,
  topLevelCount,
  valueType,
} from '../../src/panel/tabs/stateFormat';

describe('previewValue', () => {
  it('renders primitives compactly', () => {
    expect(previewValue(null)).toBe('null');
    expect(previewValue(undefined)).toBe('undefined');
    expect(previewValue(42)).toBe('42');
    expect(previewValue(true)).toBe('true');
    expect(previewValue('hi')).toBe('"hi"');
  });

  it('summarises empty and non-empty arrays', () => {
    expect(previewValue([])).toBe('[]');
    expect(previewValue([1, 2, 3])).toBe('[1,2,3]');
  });

  it('summarises a large array by length', () => {
    const big = Array.from({ length: 100 }, (_, i) => i);
    expect(previewValue(big)).toBe('Array(100)');
  });

  it('summarises empty and small objects, large objects by key count', () => {
    expect(previewValue({})).toBe('{}');
    expect(previewValue({ a: 1 })).toBe('{"a":1}');
    const wide: Record<string, number> = {};
    for (let i = 0; i < 40; i++) wide[`k${i}`] = i;
    expect(previewValue(wide)).toBe('{40 keys}');
  });

  it('truncates long strings', () => {
    const out = previewValue('x'.repeat(200), 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });

  it('handles functions and symbols', () => {
    expect(previewValue(() => 1)).toBe('<function>');
    expect(previewValue(Symbol('s'))).toContain('Symbol');
  });
});

describe('objectRows', () => {
  it('returns one row per top-level key for a plain object', () => {
    const rows = objectRows({ id: 1, name: 'Ada', tags: [] });
    expect(rows).not.toBeNull();
    expect(rows!.map(r => r.key)).toEqual(['id', 'name', 'tags']);
    expect(rows!.find(r => r.key === 'name')?.value).toBe('"Ada"');
  });

  it('returns null for non-objects (arrays, primitives, null, empty objects)', () => {
    expect(objectRows([1, 2])).toBeNull();
    expect(objectRows('str')).toBeNull();
    expect(objectRows(null)).toBeNull();
    expect(objectRows({})).toBeNull();
  });

  it('does not throw on a circular value (preview falls back)', () => {
    const c: Record<string, unknown> = { a: 1 };
    c.self = c;
    const rows = objectRows(c);
    expect(rows).not.toBeNull();
    expect(rows!.find(r => r.key === 'self')).toBeDefined();
  });
});

describe('isTreeValue / topLevelCount', () => {
  it('treats objects and arrays as tree values', () => {
    expect(isTreeValue({})).toBe(true);
    expect(isTreeValue([])).toBe(true);
  });

  it('treats primitives and null as non-tree', () => {
    expect(isTreeValue(null)).toBe(false);
    expect(isTreeValue(42)).toBe(false);
    expect(isTreeValue('x')).toBe(false);
  });

  it('counts top-level keys / elements', () => {
    expect(topLevelCount({ a: 1, b: 2 })).toBe(2);
    expect(topLevelCount([1, 2, 3])).toBe(3);
    expect(topLevelCount('x')).toBeUndefined();
  });
});

describe('safeStringify', () => {
  it('pretty-prints and handles circular / bigint / function', () => {
    const c: Record<string, unknown> = { n: 1n, f: () => 1 };
    c.self = c;
    const out = safeStringify(c);
    expect(out).toContain('<bigint:1>');
    expect(out).toContain('<function>');
    expect(out).toContain('<circular>');
  });
});

describe('valueType', () => {
  it('classifies values into short tags', () => {
    expect(valueType({})).toBe('obj');
    expect(valueType([])).toBe('arr');
    expect(valueType('x')).toBe('str');
    expect(valueType(3)).toBe('num');
    expect(valueType(true)).toBe('bool');
    expect(valueType(null)).toBe('null');
    expect(valueType(undefined)).toBe('undef');
    expect(valueType(() => 1)).toBe('fn');
  });
});

describe('shapePreview', () => {
  it('shows object key names but never values (no leak when collapsed)', () => {
    const out = shapePreview({ secretKey: 'hunter2', id: 1 });
    expect(out).toContain('secretKey');
    expect(out).toContain('id');
    expect(out).not.toContain('hunter2');
  });

  it('truncates long key lists with a +N suffix', () => {
    const out = shapePreview({ a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 }, 4);
    expect(out).toContain('a, b, c, d');
    expect(out).toContain('+2');
  });

  it('summarises arrays by length, not contents', () => {
    expect(shapePreview([])).toBe('[]');
    expect(shapePreview([10, 20, 30])).toBe('[3]');
  });

  it('shows the type for primitives, not the value', () => {
    expect(shapePreview('secret')).toBe('str');
    expect(shapePreview(42)).toBe('num');
    expect(shapePreview(null)).toBe('null');
  });

  it('handles empty object', () => {
    expect(shapePreview({})).toBe('{}');
  });
});
