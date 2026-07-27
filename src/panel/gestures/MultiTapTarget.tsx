import React, { useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

export interface MultiTapTargetProps {
  /** Number of taps required to fire `onTrigger`. Default: `5`. */
  readonly count?: number;
  /** Maximum ms between consecutive taps. Default: `300`. */
  readonly maxDelayMs?: number;
  /** Called when {@link count} taps land within the delay window. */
  onTrigger(): void;
  /**
   * When `false`, the target ignores taps. The element still mounts so
   * children render normally. Default: `true`.
   */
  readonly enabled?: boolean;
  /**
   * Pixel size of the (invisible) hit area. The target is positioned
   * absolutely so it doesn't affect layout. Default: a 50×50 pt square in
   * the top-right corner. Pass an explicit `style` to override.
   */
  readonly style?: React.ComponentProps<typeof Pressable>['style'];
}

/**
 * Invisible tap target that fires {@link MultiTapTargetProps.onTrigger}
 * after N rapid taps. Place near the panel's entry point so testers can
 * open it without a shake gesture.
 *
 * **Accessibility:** the target is intentionally hidden from screen readers
 * (`accessible={false}`, `accessibilityElementsHidden`,
 * `importantForAccessibility="no-hide-descendants"`). It's a hidden trigger,
 * not a primary UI affordance.
 *
 * @example
 * ```tsx
 * <DebugPanelProvider>
 *   <Root />
 *   <MultiTapTarget count={5} onTrigger={() => openPanel('logs')} />
 * </DebugPanelProvider>
 * ```
 */
export function MultiTapTarget({
  count = 5,
  maxDelayMs = 300,
  onTrigger,
  enabled = true,
  style,
}: MultiTapTargetProps): React.ReactElement | null {
  const tapsRef = useRef<{ count: number; lastTs: number }>({ count: 0, lastTs: 0 });

  if (!enabled) return null;

  const onPress = (): void => {
    const now = Date.now();
    const state = tapsRef.current;
    state.count = now - state.lastTs > maxDelayMs ? 1 : state.count + 1;
    state.lastTs = now;
    if (state.count >= count) {
      state.count = 0;
      onTrigger();
    }
  };

  return (
    <Pressable
      onPress={onPress}
      // Style may be a static object or the Pressable function form. Apply
      // the default `styles.target` as a fallback; consumers passing a
      // function take full responsibility for their own layout.
      style={style ?? styles.target}
      // Hidden from screen readers — this is a developer/QA gesture, not a
      // primary UI affordance.
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Default hit-area size in points. Large enough to be reliably tappable. */
const DEFAULT_HIT_AREA_PT = 50;

const styles = StyleSheet.create({
  target: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: DEFAULT_HIT_AREA_PT,
    height: DEFAULT_HIT_AREA_PT,
    // Fully transparent — the target catches taps without painting.
    backgroundColor: 'transparent',
  },
});
