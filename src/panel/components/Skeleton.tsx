import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme';
import { useReduceMotion } from '../util/useReduceMotion';

export interface SkeletonProps {
  /** Width — number (px) or percentage string. Default: `'100%'`. */
  readonly width?: DimensionValue;
  /** Height in px. Default: `12`. */
  readonly height?: number;
  /** Corner radius in px. Default: a small rounded rect. */
  readonly radius?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A shimmering placeholder block for content that hasn't arrived yet. Use to
 * reserve a row's height before its data lands (no layout jump) and to signal
 * "loading" without a blocking spinner.
 *
 * The shimmer is a looping opacity pulse on `Animated` (no Reanimated peer); it
 * respects the OS "reduce motion" setting — there it renders as a static base
 * fill. Decorative: hidden from the accessibility tree.
 */
export function Skeleton({
  width = '100%',
  height = 12,
  radius,
  style,
}: SkeletonProps): React.ReactElement {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: t.motion.duration.slow,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: t.motion.duration.slow,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse, t.motion.duration.slow]);

  // Pulse the opacity between the base fill and a lighter "highlight" feel by
  // crossfading two stacked layers would be heavier; a single opacity pulse on
  // the highlight colour reads as a shimmer and stays on the native driver.
  const opacity = reduceMotion
    ? 1
    : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        {
          width,
          height,
          borderRadius: radius ?? t.radii.sm,
          backgroundColor: reduceMotion ? t.colors.skeletonBase : t.colors.skeletonHighlight,
          opacity,
        },
        style,
      ]}
    />
  );
}

/**
 * A stack of full-width skeleton lines — a convenience for list/empty bodies
 * that want to reserve several rows while data loads.
 */
export function SkeletonLines({
  count = 4,
  lineHeight = 14,
  gap,
}: {
  count?: number;
  lineHeight?: number;
  gap?: number;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.lines, { gap: gap ?? t.spacing.md, padding: t.spacing.lg }]}
    >
      {Array.from({ length: count }).map((_, i) => (
        // Vary the last line's width so the block doesn't read as a solid grid.
        <Skeleton key={i} height={lineHeight} width={i === count - 1 ? '60%' : '100%'} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  lines: { width: '100%' },
});
