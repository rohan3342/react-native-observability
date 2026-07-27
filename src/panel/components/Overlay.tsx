import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import type { Theme } from '../theme';
import { useReduceMotion } from '../util/useReduceMotion';

/** Where the overlay content sits within the full-screen layer. */
export type OverlayPlacement = 'fill' | 'center' | 'bottom';

export interface OverlayProps {
  /** Whether the overlay is mounted/visible. When false, it animates out then unmounts. */
  readonly visible: boolean;
  /** Called on scrim tap and Android hardware back. */
  onRequestClose(): void;
  /**
   * Content placement. `fill` = full-viewport (the panel itself); `center` =
   * centred card (pickers); `bottom` = bottom-anchored sheet (detail views).
   * Default: `center`.
   */
  readonly placement?: OverlayPlacement;
  /**
   * Show the dimmed backdrop behind the content. Default: `true`. The `fill`
   * panel sets this `false` (it paints its own opaque background).
   */
  readonly scrim?: boolean;
  /** Accessibility label for the scrim's dismiss affordance. */
  readonly closeAccessibilityLabel?: string;
  readonly children: React.ReactNode;
}

const ENTER_MS = 220;
const EXIT_MS = 160;

/**
 * In-tree replacement for React Native's `<Modal>`, with built-in enter/exit
 * animation.
 *
 * RN's `<Modal>` mounts a **separate native window**, which causes real
 * problems in host apps: it detaches from `react-native-screens`/Reanimated
 * host views, fights gesture handlers, can present as a half-height pageSheet
 * under iOS bridgeless mode, and cannot be animated together with the rest of
 * the React tree. This component instead renders an absolutely-positioned,
 * full-viewport layer **inside** the panel provider's tree — so it composes
 * with the app's renderer, animates smoothly, and never spawns a native window.
 *
 * **Animation.** A single `Animated.Value` drives a scrim fade plus a
 * placement-specific content transition (`center`/`fill` fade+scale, `bottom`
 * slide-up), using RN's built-in `Animated` (no Reanimated dependency). When
 * `visible` flips to false the overlay animates *out* and only then unmounts.
 * Respects the OS "reduce motion" setting (see {@link useReduceMotion}) — there
 * the transition is instant.
 *
 * It also reproduces the `<Modal>` behaviours the panel relied on: a
 * tap-to-dismiss scrim, Android hardware-back handling (via `BackHandler`,
 * feature-detected so web/SSR/tests no-op), and `accessibilityViewIsModal`.
 *
 * **Placement note:** because it lives in the React tree, the overlay cannot
 * escape a parent with `overflow: 'hidden'`. Mount `DebugPanelProvider` near
 * the app root (already the documented guidance) so the overlay fills the
 * screen.
 */
export function Overlay({
  visible,
  onRequestClose,
  placement = 'center',
  scrim = true,
  closeAccessibilityLabel = 'Close',
  children,
}: OverlayProps): React.ReactElement | null {
  const t = useTheme();
  const styles = buildStyles(t);
  const reduceMotion = useReduceMotion();

  // `rendered` stays true through the exit animation so the content can fade
  // out before it leaves the tree. `progress` is 0 (hidden) … 1 (shown); it
  // starts at 0 even when initially visible so the entrance animation plays on
  // first mount (the panel is mounted fresh each time it opens).
  const [rendered, setRendered] = useState(visible);
  // `progress` (0→1) drives the scrim fade + the center/fill fade-scale.
  const progress = useRef(new Animated.Value(0)).current;
  // Bottom sheets translate by their own measured height for a true slide; until
  // measured we fall back to the screen height so the first frame starts off-screen.
  const sheetHeight = useRef(Dimensions.get('window').height);
  const translateY = useRef(new Animated.Value(sheetHeight.current)).current;

  const onSheetLayout = (e: LayoutChangeEvent): void => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) sheetHeight.current = h;
  };

  useEffect(() => {
    if (visible) {
      setRendered(true);
      if (reduceMotion) {
        progress.setValue(1);
        translateY.setValue(0);
        return undefined;
      }
      // Scrim/fade in with a quick timing; the bottom sheet rises on a spring
      // for a natural settle (no bounce overshoot past the resting point).
      const fade = Animated.timing(progress, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      });
      const rise = Animated.spring(translateY, {
        toValue: 0,
        damping: 22,
        stiffness: 240,
        mass: 0.9,
        useNativeDriver: true,
      });
      const anim = Animated.parallel([fade, rise]);
      anim.start();
      return () => anim.stop();
    }
    // Exiting — fade the scrim and slide the sheet back down, then unmount.
    if (reduceMotion) {
      progress.setValue(0);
      translateY.setValue(sheetHeight.current);
      setRendered(false);
      return undefined;
    }
    const anim = Animated.parallel([
      Animated.timing(progress, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
      Animated.timing(translateY, {
        toValue: sheetHeight.current,
        duration: EXIT_MS,
        useNativeDriver: true,
      }),
    ]);
    anim.start(result => {
      if (result?.finished) setRendered(false);
    });
    return () => anim.stop();
  }, [visible, reduceMotion, progress, translateY]);

  // Android hardware back closes the overlay while it is visible. Guarded so a
  // runtime without a full `BackHandler` (web, SSR, a partial test mock) never
  // crashes — the back integration simply no-ops there.
  useEffect(() => {
    if (!visible) return undefined;
    if (typeof BackHandler?.addEventListener !== 'function') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onRequestClose();
      return true; // consumed — don't pop the navigation stack underneath
    });
    return () => sub?.remove();
  }, [visible, onRequestClose]);

  if (!rendered) return null;

  const containerStyle =
    placement === 'fill' ? styles.fill : placement === 'bottom' ? styles.bottom : styles.center;

  // The scrim fades with progress in every placement. The content transform is
  // placement-specific: a `bottom` sheet truly slides (its measured height →ms→
  // 0, no fade); `center`/`fill` fade + scale up slightly.
  const contentStyle: Animated.WithAnimatedObject<ViewStyle> =
    placement === 'bottom'
      ? { transform: [{ translateY }] }
      : {
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        };

  return (
    <View style={styles.root} accessibilityViewIsModal>
      {scrim ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrimBg, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel={closeAccessibilityLabel}
          />
        </Animated.View>
      ) : null}
      <Animated.View
        style={[containerStyle, contentStyle]}
        pointerEvents="box-none"
        {...(placement === 'bottom' ? { onLayout: onSheetLayout } : {})}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };
export { pressedOverlay };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      // Token-driven stacking (was a magic 9999) so a host that wraps the panel
      // in its own positioned context stays predictable. `elevation` mirrors it
      // on Android so the layer sits above app chrome.
      zIndex: t.zIndex.overlay,
      elevation: t.zIndex.overlay,
    },
    scrimBg: { backgroundColor: t.colors.backdrop },
    fill: { flex: 1 },
    center: { flex: 1, justifyContent: 'center', padding: t.spacing.xl },
    bottom: { flex: 1, justifyContent: 'flex-end' },
  });
}
