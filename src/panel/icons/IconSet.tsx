import { createContext, useContext } from 'react';
import type { ReactElement } from 'react';
import type { IconName } from './Icon';

/**
 * Resolved props passed to a custom icon renderer — the size and colour the
 * panel computed from theme tokens, so the consumer's vector icon matches the
 * built-in glyph it replaces.
 */
export interface IconRenderProps {
  readonly name: IconName;
  /** Pixel size (already resolved from the `iconSizes` token or an override). */
  readonly size: number;
  /** Theme colour (already resolved from the icon's tone). */
  readonly color: string;
}

/**
 * A consumer-supplied renderer for one icon. Return any element (e.g. a
 * `lucide-react-native` or `@expo/vector-icons` glyph) sized + coloured from the
 * passed props. Returning `null` falls back to the built-in Unicode glyph.
 */
export type IconRenderer = (props: IconRenderProps) => ReactElement | null;

/**
 * A partial map of icon name → renderer. Inject via
 * `DebugPanelProvider.iconSet` to swap individual icons for the host app's own
 * vector set, keeping the package dependency-free (the icons are injected, never
 * imported here).
 */
export type IconSet = Partial<Record<IconName, IconRenderer>>;

const IconSetContext = createContext<IconSet | null>(null);

export const IconSetProvider = IconSetContext.Provider;

/** Returns the injected {@link IconSet}, or `null` when none was configured. */
export function useIconSet(): IconSet | null {
  return useContext(IconSetContext);
}
