import { useEffect, useRef } from 'react';

/**
 * Single accelerometer sample. All values are in `g` (standard gravity).
 * Sign convention follows Expo / `react-native-sensors`: positive z points
 * toward the screen; positive x toward the right; positive y toward the top.
 */
export interface AccelerometerSample {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Minimal accelerometer source. Structurally satisfied by:
 *  - Expo's `Accelerometer` from `expo-sensors`
 *  - `accelerometer` Observable from `react-native-sensors` (after a `.subscribe(...)` wrap)
 *  - any custom polyfill
 *
 * The hook does not own a peer dependency — consumers pass in whichever
 * source they already use.
 */
export interface AccelerometerSource {
  /**
   * Subscribe to accelerometer samples. The hook calls this once on mount
   * and unsubscribes on unmount.
   *
   * @returns A teardown function that stops the subscription.
   */
  addListener(listener: (sample: AccelerometerSample) => void): { remove(): void };
}

export interface UseShakeDetectorOptions {
  /**
   * Magnitude threshold (in `g`) above which a sample counts as a shake.
   * Default: `1.8` — empirically a deliberate wrist shake; ambient motion
   * (walking, in a vehicle) stays below this.
   */
  readonly threshold?: number;
  /**
   * Cooldown window in milliseconds after a detected shake during which
   * subsequent shakes are suppressed. Prevents a single shake gesture from
   * firing multiple times. Default: `1000`.
   */
  readonly cooldownMs?: number;
  /**
   * When `false`, the hook unsubscribes from the source and stops firing.
   * Toggling this avoids the `Pressable`-style "rebuild listener every
   * render" trap. Default: `true`.
   */
  readonly enabled?: boolean;
}

/**
 * Threshold-based shake detector.
 *
 * Pass any accelerometer source whose samples include `x`, `y`, `z` fields
 * in `g`. The hook computes magnitude (`sqrt(x² + y² + z²)`) per sample;
 * when magnitude exceeds {@link UseShakeDetectorOptions.threshold} and no
 * shake fired within the previous {@link UseShakeDetectorOptions.cooldownMs}
 * window, it calls `onShake()`.
 *
 * @example
 * ```tsx
 * import { Accelerometer } from 'expo-sensors';
 *
 * useShakeDetector(Accelerometer, () => openPanel('logs'));
 * ```
 *
 * @example
 * ```tsx
 * // react-native-sensors — wrap the Observable in an AccelerometerSource.
 * import { accelerometer, SensorTypes, setUpdateIntervalForType } from 'react-native-sensors';
 * setUpdateIntervalForType(SensorTypes.accelerometer, 100);
 * const source: AccelerometerSource = {
 *   addListener: (cb) => {
 *     const sub = accelerometer.subscribe(({ x, y, z }) => cb({ x, y, z }));
 *     return { remove: () => sub.unsubscribe() };
 *   },
 * };
 * useShakeDetector(source, () => openPanel());
 * ```
 */
export function useShakeDetector(
  accelerometer: AccelerometerSource | null | undefined,
  onShake: () => void,
  options: UseShakeDetectorOptions = {}
): void {
  const { threshold = 1.8, cooldownMs = 1000, enabled = true } = options;

  // Stash the latest onShake in a ref so we don't have to re-subscribe to
  // the accelerometer every time the consumer's callback changes.
  const onShakeRef = useRef(onShake);
  useEffect(() => {
    onShakeRef.current = onShake;
  }, [onShake]);

  useEffect(() => {
    if (!enabled || accelerometer == null) return;

    let lastShake = 0;
    const subscription = accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      if (magnitude < threshold) return;
      const now = Date.now();
      if (now - lastShake < cooldownMs) return;
      lastShake = now;
      onShakeRef.current();
    });

    return () => subscription.remove();
  }, [accelerometer, threshold, cooldownMs, enabled]);
}
