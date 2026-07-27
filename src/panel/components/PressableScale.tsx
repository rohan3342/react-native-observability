import React, { useCallback, useRef } from 'react';
import { Animated, Pressable } from 'react-native';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { useReduceMotion } from '../util/useReduceMotion';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Scale applied while pressed. Default: `0.98`. */
  readonly activeScale?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
}

/**
 * A `Pressable` that gently scales down while pressed and springs back on
 * release (audit M3 `scale-feedback`). Use for tappable **card surfaces**
 * (state slices, mock rules, endpoint rows) where a background wash alone reads
 * as flat. The scale is a `transform` (no layout shift) on the native driver,
 * and snaps off under reduce-motion.
 *
 * All other `Pressable` props (accessibility, `onPress`, `onLongPress`,
 * `hitSlop`) pass straight through.
 */
export function PressableScale({
  activeScale = 0.98,
  style,
  children,
  ...rest
}: PressableScaleProps): React.ReactElement {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (to: number) => {
      if (reduceMotion) {
        scale.setValue(1);
        return;
      }
      Animated.spring(scale, {
        toValue: to,
        damping: 15,
        stiffness: 300,
        mass: 0.6,
        useNativeDriver: true,
      }).start();
    },
    [reduceMotion, scale]
  );

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable onPressIn={() => animate(activeScale)} onPressOut={() => animate(1)} {...rest}>
        {children}
      </Pressable>
    </Animated.View>
  );
}
