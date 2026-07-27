import { Animated, Easing } from 'react-native';
import type { Theme } from '../theme';

/**
 * Maps a motion-token easing tuple (`[x1, y1, x2, y2]`) to a React Native
 * `Easing` function. The tokens store eases as plain data (so the token layer
 * stays free of a `react-native` import); this is where they become usable by
 * `Animated.timing`.
 */
export function toEasing(curve: readonly [number, number, number, number]) {
  return Easing.bezier(curve[0], curve[1], curve[2], curve[3]);
}

/**
 * A reduce-motion-aware timing transition built from theme motion tokens. When
 * `reduceMotion` is true it snaps to the target instantly (duration 0); the
 * spring/timing call always uses the native driver (transform/opacity only).
 *
 * Centralises the "animate this `Animated.Value` to N, fast/base/slow, with the
 * standard ease, unless reduce-motion" pattern the interaction polish reuses.
 */
export function animateTo(
  value: Animated.Value,
  toValue: number,
  t: Theme,
  opts: { duration?: keyof Theme['motion']['duration']; reduceMotion: boolean } = {
    reduceMotion: false,
  }
): Animated.CompositeAnimation {
  const duration = opts.reduceMotion ? 0 : t.motion.duration[opts.duration ?? 'fast'];
  return Animated.timing(value, {
    toValue,
    duration,
    easing: toEasing(t.motion.easing.standard),
    useNativeDriver: true,
  });
}
