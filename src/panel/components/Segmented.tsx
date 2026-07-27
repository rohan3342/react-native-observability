import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, ViewStyle } from 'react-native';
import { TextX, useTheme, isFocused } from '../theme';
import type { Theme } from '../theme';
import { useReduceMotion } from '../util/useReduceMotion';
import { toEasing } from '../util/motion';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Optional count appended as `(n)`. */
  readonly count?: number;
}

export interface SegmentedProps<T extends string> {
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly value: T;
  onChange(value: T): void;
  /** Accessibility group label, e.g. "View". */
  readonly accessibilityLabel?: string;
}

interface SegLayout {
  readonly x: number;
  readonly width: number;
}

/**
 * A connected segmented control — adjacent segments inside one rounded track,
 * the active one filled. Distinct from the standalone filter `Pill`s so a
 * **mode switch** (e.g. Requests / Rules) reads differently from a filter row.
 *
 * The active fill is a single **thumb** that slides between segments rather than
 * snapping (audit M5). Segment positions are measured via `onLayout`; the thumb
 * animates its `left` + `width` to the active segment. Reduce-motion snaps
 * instantly.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: SegmentedProps<T>): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const reduceMotion = useReduceMotion();

  // Measured per-segment geometry (relative to the track), keyed by index.
  const [layouts, setLayouts] = useState<readonly (SegLayout | undefined)[]>(() =>
    options.map(() => undefined)
  );
  const activeIndex = Math.max(
    0,
    options.findIndex(o => o.value === value)
  );
  const active = layouts[activeIndex];

  // The thumb's position (`left`) and `width` are both layout props, so they
  // animate together on the **JS driver**. (The native driver can't animate
  // `width`, and mixing drivers on one node throws — so we keep both off it.
  // The element is small and the transition short, so JS-driven is smooth.)
  const left = useRef(new Animated.Value(0)).current;
  const width = useRef(new Animated.Value(0)).current;
  const settled = useRef(false);

  useEffect(() => {
    if (active === undefined) return undefined;
    // First measurement positions the thumb without animating (no slide-in from 0).
    if (!settled.current || reduceMotion) {
      settled.current = true;
      left.setValue(active.x);
      width.setValue(active.width);
      return undefined;
    }
    const duration = t.motion.duration.base;
    const easing = toEasing(t.motion.easing.standard);
    const anim = Animated.parallel([
      Animated.timing(left, { toValue: active.x, duration, easing, useNativeDriver: false }),
      Animated.timing(width, { toValue: active.width, duration, easing, useNativeDriver: false }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, reduceMotion, left, width, t.motion.duration.base, t.motion.easing.standard]);

  const onSegLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width: w } = e.nativeEvent.layout;
    setLayouts(prev => {
      const cur = prev[index];
      if (cur !== undefined && cur.x === x && cur.width === w) return prev;
      const next = prev.slice();
      next[index] = { x, width: w };
      return next;
    });
  };

  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      {...(accessibilityLabel !== undefined ? { accessibilityLabel } : {})}
    >
      {active !== undefined ? (
        <Animated.View pointerEvents="none" style={[styles.thumb, { left, width }]} />
      ) : null}
      {options.map((opt, index) => {
        const isActive = opt.value === value;
        const text = opt.count !== undefined ? `${opt.label} (${opt.count})` : opt.label;
        return (
          <Pressable
            key={opt.value}
            onLayout={onSegLayout(index)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt.label}
            onPress={() => onChange(opt.value)}
            style={state => [
              styles.segment,
              isFocused(state) && styles.segmentFocused,
              state.pressed && !isActive && pressedOverlay,
            ]}
          >
            <TextX
              variant="caption"
              mono
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
            >
              {text}
            </TextX>
          </Pressable>
        );
      })}
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.6 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    track: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      backgroundColor: t.colors.surfaceMuted,
      borderRadius: t.radii.md,
      padding: 2,
    },
    // The sliding active fill, behind the segment labels. `left` + `width` are
    // animated inline (JS driver), so they're intentionally not set here.
    thumb: {
      position: 'absolute',
      top: 2,
      bottom: 2,
      backgroundColor: t.colors.accent,
      borderRadius: t.radii.md - 2,
    },
    segment: {
      paddingHorizontal: t.spacing.md + 2,
      paddingVertical: t.spacing.sm,
      // Touch floor minus the track's 2px padding each side.
      minHeight: t.control.lg - 4,
      justifyContent: 'center',
      borderRadius: t.radii.md - 2,
    },
    segmentFocused: { borderWidth: 2, borderColor: t.colors.focusRing },
    label: { fontSize: 12, fontWeight: '600', color: t.colors.textMuted },
    labelActive: { color: t.colors.textInverse },
  });
}
