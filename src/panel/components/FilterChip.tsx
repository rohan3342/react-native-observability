import React from 'react';
import { Pill } from '../theme';

export interface FilterChipProps {
  readonly label: string;
  readonly active: boolean;
  /** Optional count rendered after the label, e.g. "Info (12)". */
  readonly count?: number | undefined;
  /** Accent colour used when active. Defaults to the theme accent. */
  readonly color?: string | undefined;
  onPress(): void;
}

/**
 * Filter pill used by tab rows.
 *
 * Thin wrapper over the themed {@link Pill} primitive — kept as a named
 * export for backwards compatibility with the prior chrome API, and so
 * call-sites stay explicit about intent ("this is a filter").
 */
export function FilterChip({
  label,
  active,
  count,
  color,
  onPress,
}: FilterChipProps): React.ReactElement {
  return <Pill label={label} active={active} count={count} accent={color} onPress={onPress} />;
}
