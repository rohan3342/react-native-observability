import { nextEntryId, _resetEntryIdSeq } from '../../src/logger/internal/entryId';

beforeEach(() => {
  _resetEntryIdSeq();
});

describe('nextEntryId', () => {
  it('is monotonic — the sequence strictly increases', () => {
    const ids = Array.from({ length: 5 }, () => nextEntryId());
    const seqs = ids.map(id => Number(id.split('-')[1]));
    expect(seqs).toEqual([0, 1, 2, 3, 4]);
  });

  it('shares one boot id across the process', () => {
    const a = nextEntryId();
    const b = nextEntryId();
    expect(a.split('-')[0]).toBe(b.split('-')[0]);
  });

  it('never repeats an id within a run', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => nextEntryId()));
    expect(ids.size).toBe(1000);
  });

  it('is deterministic per sequence position after a reset', () => {
    const first = nextEntryId();
    _resetEntryIdSeq();
    const again = nextEntryId();
    // Same boot id + same seq (0) → identical id. This is what makes the
    // sampling decision for entry N reproducible.
    expect(again).toBe(first);
  });
});
