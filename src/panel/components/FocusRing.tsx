import type { ViewStyle } from 'react-native';
import type { Theme } from '../theme';
import { isFocused } from '../theme';

export { isFocused };

/**
 * Visible focus outline for keyboard / assistive-tech navigation.
 *
 * React Native has no DOM `:focus-visible`, but `Pressable`'s render-prop state
 * exposes a `focused` flag on platforms that support focus traversal (hardware
 * keyboard, Android TV, switch control); read it via {@link isFocused}. Spread
 * this style when focused so a control gets a clear 2px outline that meets the
 * focus-state accessibility rule. The unfocused branch keeps a transparent 2px
 * border so toggling focus never shifts layout.
 *
 * @example
 * ```tsx
 * <Pressable style={(s) => [styles.base, focusRingStyle(theme, isFocused(s))]}>
 * ```
 */
export function focusRingStyle(t: Theme, focused: boolean): ViewStyle {
  return {
    borderWidth: 2,
    borderColor: focused ? t.colors.focusRing : 'transparent',
  };
}
