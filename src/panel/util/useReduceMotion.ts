import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "reduce motion" accessibility setting so the panel can skip
 * non-essential animation for users who request it. Returns `true` when motion
 * should be reduced.
 *
 * Reads the initial value once and subscribes to changes. Every call is
 * feature-detected — on a runtime without `AccessibilityInfo` (web, SSR, a
 * partial test mock) it stays `false` and never throws.
 */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    const api = AccessibilityInfo as Partial<typeof AccessibilityInfo> | undefined;

    if (typeof api?.isReduceMotionEnabled === 'function') {
      api
        .isReduceMotionEnabled()
        .then(v => {
          if (mounted) {
            setReduce(v);
          }
        })
        .catch(() => undefined);
    }

    const sub =
      typeof api?.addEventListener === 'function'
        ? api.addEventListener('reduceMotionChanged', (v: boolean) => {
            if (mounted) {
              setReduce(v);
            }
          })
        : undefined;

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}
