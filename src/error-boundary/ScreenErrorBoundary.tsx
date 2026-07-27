import React, { useCallback, useState } from 'react';
import { AppErrorBoundary } from './AppErrorBoundary';
import type { ScreenErrorBoundaryProps } from './types';

/**
 * Signature of `useFocusEffect` from `@react-navigation/native`.
 * Typed locally so the peer dep's types don't need to be installed.
 */
type FocusEffectFn = (effect: () => void | (() => void)) => void;

/**
 * Memoised lazy accessor for `useFocusEffect`.
 *
 * The first call attempts `require('@react-navigation/native')` and caches the
 * result. Subsequent calls return the cached value without re-loading.
 *
 * Why lazy (audit findings I6, I7): A top-level `require()` is a module-parse-time
 * side effect. With `sideEffects: false` in package.json that side effect is
 * silently dropped by tree-shaking bundlers, and worse, the require runs even
 * for consumers who never use `<ScreenErrorBoundary resetOnBlur />`. Deferring
 * the load to first render keeps the module pure and only pays the lookup cost
 * when the feature is actually requested.
 */
let cachedFocusEffect: FocusEffectFn | null | undefined;

function getUseFocusEffect(): FocusEffectFn | null {
  if (cachedFocusEffect !== undefined) return cachedFocusEffect;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nav = require('@react-navigation/native') as { useFocusEffect: FocusEffectFn };
    cachedFocusEffect = nav.useFocusEffect;
  } catch {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[observability] ScreenErrorBoundary: @react-navigation/native is not installed. ' +
          '`resetOnBlur` is a no-op.'
      );
    }
    cachedFocusEffect = null;
  }
  return cachedFocusEffect;
}

/** @internal — test teardown only. */
export function _resetFocusEffectCache(): void {
  cachedFocusEffect = undefined;
}

/**
 * Internal component that registers a focus-blur effect.
 * Mounted only when `resetOnBlur={true}` AND `@react-navigation/native` is
 * available, so `useFocusEffect` is guaranteed non-null when this component renders.
 */
function BlurResetEffect({
  onBlur,
  useFocusEffect,
}: {
  onBlur: () => void;
  useFocusEffect: FocusEffectFn;
}): null {
  useFocusEffect(
    useCallback(
      () => () => {
        onBlur();
      },
      [onBlur]
    )
  );
  return null;
}

/**
 * A navigation-aware error boundary for use at the screen level.
 *
 * Wraps `AppErrorBoundary` with an optional `resetOnBlur` feature: when the user
 * navigates away from the screen the boundary resets automatically, so they see
 * a fresh render when they navigate back rather than a stale error fallback.
 *
 * `resetOnBlur` requires `@react-navigation/native` to be installed. When the
 * package is absent the prop is silently ignored — the boundary still catches errors.
 *
 * @example
 * ```tsx
 * // In a React Navigation screen component:
 * export default function CheckoutScreen() {
 *   return (
 *     <ScreenErrorBoundary resetOnBlur logger={logger} FallbackComponent={ErrorFallback}>
 *       <CheckoutForm />
 *     </ScreenErrorBoundary>
 *   );
 * }
 * ```
 */
export function ScreenErrorBoundary({
  resetOnBlur = false,
  ...rest
}: ScreenErrorBoundaryProps): React.ReactElement {
  const [resetKey, setResetKey] = useState(0);
  const increment = useCallback(() => setResetKey(k => k + 1), []);

  // Only resolve the peer when resetOnBlur is requested.
  const focusEffect = resetOnBlur ? getUseFocusEffect() : null;

  return (
    <>
      {focusEffect !== null && <BlurResetEffect onBlur={increment} useFocusEffect={focusEffect} />}
      <AppErrorBoundary key={resetKey} {...rest} />
    </>
  );
}
