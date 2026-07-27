import { CURRENT_SCHEMA_VERSION, deserialize, serialize, wrap } from '../../src/storage/schema';

describe('schema — wrap / serialize', () => {
  it('wraps a payload with the current schema version', () => {
    const env = wrap({ foo: 'bar' });
    expect(env.v).toBe(CURRENT_SCHEMA_VERSION);
    expect(env.payload).toEqual({ foo: 'bar' });
  });

  it('serialize produces valid JSON containing the envelope', () => {
    const raw = serialize({ foo: 'bar' });
    const parsed = JSON.parse(raw);
    expect(parsed.v).toBe(CURRENT_SCHEMA_VERSION);
    expect(parsed.payload).toEqual({ foo: 'bar' });
  });
});

describe('schema — deserialize', () => {
  it('reads a current-version envelope', () => {
    const raw = serialize({ x: 1 });
    const result = deserialize<{ x: number }>(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload).toEqual({ x: 1 });
  });

  it('returns parse-error on invalid JSON', () => {
    const result = deserialize('not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('parse-error');
  });

  it('returns shape-error when the envelope is missing required fields', () => {
    const result = deserialize(JSON.stringify({ payload: {} })); // no v
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('shape-error');
  });

  it('returns shape-error on non-object roots', () => {
    expect(deserialize('null').ok).toBe(false);
    expect(deserialize('42').ok).toBe(false);
  });

  it('returns unknown-version for envelopes from a newer schema', () => {
    const raw = JSON.stringify({ v: 999, payload: {} });
    const result = deserialize(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('unknown-version');
  });
});
