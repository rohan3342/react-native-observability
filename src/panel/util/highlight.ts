/** One segment of a highlight split: text plus whether it matched the query. */
export interface HighlightSegment {
  readonly s: string;
  readonly hit: boolean;
}

/**
 * Splits `text` into alternating non-match / match segments for a
 * case-insensitive `query`. Pure (no React/RN) so it is cheap to unit-test.
 * An empty/whitespace query yields a single non-hit segment.
 */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const q = query.trim();
  if (q === '') return [{ s: text, hit: false }];
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const out: HighlightSegment[] = [];
  let i = 0;
  for (;;) {
    const idx = lowerText.indexOf(lowerQ, i);
    if (idx === -1) {
      if (i < text.length) out.push({ s: text.slice(i), hit: false });
      break;
    }
    if (idx > i) out.push({ s: text.slice(i, idx), hit: false });
    out.push({ s: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return out.length > 0 ? out : [{ s: text, hit: false }];
}
