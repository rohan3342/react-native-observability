import { useMemo } from 'react';
import { Platform, StatusBar } from 'react-native';

/** Safe-area insets in logical pixels. */
export interface PanelInsets {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
}

/**
 * Platform estimate used when the consumer doesn't supply real insets. Covers
 * the cases the old static `safeTop: 44` token missed — Android status-bar
 * height, and a bottom gesture-bar allowance on modern iOS.
 *
 * The library deliberately does **not** `require('react-native-safe-area-context')`
 * itself: a dynamic require of an optional native peer from the pre-built panel
 * chunk fails under Metro ("Requiring unknown module") even inside a try/catch,
 * because Metro resolves the literal at bundle time. Consumers that use
 * safe-area-context pass its insets in via `DebugPanelProvider.safeAreaInsets`.
 */
function estimateInsets(): PanelInsets {
  // Feature-detect Platform/StatusBar so a partial RN mock (tests, web) can't
  // throw — the panel must render even with an incomplete runtime.
  const os = (Platform as Partial<typeof Platform> | undefined)?.OS;
  if (os === 'android') {
    const statusBar = StatusBar as Partial<typeof StatusBar> | undefined;
    return { top: statusBar?.currentHeight ?? 24, bottom: 0, left: 0, right: 0 };
  }
  // iOS / default: a reasonable notch/Dynamic-Island + home-indicator allowance.
  return { top: 47, bottom: 34, left: 0, right: 0 };
}

/**
 * Resolve the safe-area insets for the panel's top/bottom padding.
 *
 * @param injected - real insets supplied by the consumer (e.g. from
 *   `react-native-safe-area-context`'s `useSafeAreaInsets()` via
 *   `DebugPanelProvider.safeAreaInsets`). When omitted, a platform estimate is
 *   used — correct enough that the header never clips the notch and bottom
 *   content clears the home-gesture bar, without the panel hard-depending on
 *   any native peer.
 */
export function usePanelInsets(injected?: Partial<PanelInsets>): PanelInsets {
  return useMemo(() => {
    const base = estimateInsets();
    if (injected === undefined) return base;
    return {
      top: injected.top ?? base.top,
      bottom: injected.bottom ?? base.bottom,
      left: injected.left ?? base.left,
      right: injected.right ?? base.right,
    };
  }, [injected?.top, injected?.bottom, injected?.left, injected?.right]);
}
