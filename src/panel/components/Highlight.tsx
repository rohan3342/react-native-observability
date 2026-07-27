import React, { useMemo } from 'react';
import { TextX, useTheme } from '../theme';
import type { TextXProps } from '../theme';
import { splitHighlight } from '../util/highlight';

export interface HighlightProps extends Omit<TextXProps, 'children'> {
  /** Full text to render. */
  readonly text: string;
  /** Substring to highlight (case-insensitive). Empty = no highlight. */
  readonly query: string;
}

/**
 * Renders `text` with every case-insensitive occurrence of `query` visually
 * emphasised (accent background). Used in Logs/Network rows so a search match
 * shows *where* it matched, not just *that* it matched. All other `TextX`
 * props (variant, numberOfLines, etc.) pass through.
 */
export function Highlight({ text, query, ...rest }: HighlightProps): React.ReactElement {
  const t = useTheme();
  const segments = useMemo(() => splitHighlight(text, query), [text, query]);
  return (
    <TextX {...rest}>
      {segments.map((seg, i) =>
        seg.hit ? (
          <TextX
            key={i}
            {...rest}
            style={[rest.style, { backgroundColor: t.colors.warning, color: t.colors.textInverse }]}
          >
            {seg.s}
          </TextX>
        ) : (
          seg.s
        )
      )}
    </TextX>
  );
}
