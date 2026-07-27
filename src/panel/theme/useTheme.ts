import { useContext } from 'react';
import { ThemeContext } from './ThemeProvider';
import type { Theme } from './tokens';

/**
 * Returns the active panel {@link Theme}.
 *
 * Use inside any component rendered by the debug panel chrome or tabs.
 * The returned object is stable across renders (memoised by
 * `ThemeProvider`) so it is safe to pass as a `StyleSheet.create` input
 * via `useMemo` and as a dependency of other hooks.
 *
 * Reading this hook outside a {@link ThemeProvider} silently falls back
 * to the built-in light tokens — panel components are always inside the
 * provider in practice, but tests and stand-alone primitives stay
 * renderable without explicit wrapping.
 */
export function useTheme(): Theme {
  return useContext(ThemeContext);
}
