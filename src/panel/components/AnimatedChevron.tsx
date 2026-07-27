import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { useTheme } from '../theme';
import { useReduceMotion } from '../util/useReduceMotion';
import { toEasing } from '../util/motion';

/**
 * A disclosure caret that **rotates** between collapsed and expanded instead of
 * swapping glyphs. It renders the `chevron-right` mark and animates a 90°
 * rotation on `expanded` — smoother than a hard `▸`→`▾` swap (audit M6).
 *
 * Reduce-motion aware: the rotation snaps when the OS requests reduced motion.
 * Decorative — it sits inside an already-labelled disclosure control, so it's
 * hidden from the accessibility tree.
 */
export function AnimatedChevron({
  expanded,
  size = 11,
  style,
}: {
  readonly expanded: boolean;
  /** Glyph size in px. Default: `11` (the inline caret size). */
  readonly size?: number;
  readonly style?: StyleProp<TextStyle>;
}): React.ReactElement {
  const t = useTheme();
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(expanded ? 1 : 0);
      return undefined;
    }
    const anim = Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: t.motion.duration.base,
      easing: toEasing(t.motion.easing.standard),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [expanded, reduceMotion, progress, t.motion.duration.base, t.motion.easing.standard]);

  const rotate = progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });

  return (
    <Animated.Text
      accessibilityElementsHidden
      importantForAccessibility="no"
      allowFontScaling={false}
      style={[
        {
          fontSize: size,
          lineHeight: size + 2,
          color: t.colors.textMuted,
          transform: [{ rotate }],
        },
        style,
      ]}
    >
      ▸
    </Animated.Text>
  );
}
