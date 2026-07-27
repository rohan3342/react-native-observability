import { useCallback } from 'react';
import type { Logger } from '../../logger/Logger';
import { trackScreen } from '../../integrations/screen';

/** Signature of `useFocusEffect` from `@react-navigation/native`. */
type FocusEffectFn = (effect: () => void | (() => void)) => void;

/** Signature of `useRoute` from `@react-navigation/native`. */
type UseRouteFn = () => { name: string; params?: unknown };

interface NavModule {
  useFocusEffect: FocusEffectFn;
  useRoute: UseRouteFn;
}

/**
 * Lazy-loaded `@react-navigation/native` hooks. Resolved on first call to
 * {@link useScreenTracker}; cached thereafter. Tri-state cache so the
 * "peer-missing" warning fires exactly once.
 *
 * Mirrors the lazy pattern used by `ScreenErrorBoundary` (audit findings I6,
 * I7). Top-level require would be a module-parse-time side effect, defeating
 * `sideEffects: false` and forcing every consumer of any observer file to
 * load the peer.
 */
let cachedNav: NavModule | null | undefined;

function getNav(): NavModule | null {
  if (cachedNav !== undefined) return cachedNav;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@react-navigation/native') as NavModule;
    cachedNav = mod;
  } catch {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[observability] useScreenTracker: @react-navigation/native is not installed. The hook is a no-op.'
      );
    }
    cachedNav = null;
  }
  return cachedNav;
}

/** @internal — test teardown only. */
export function _resetNavCache(): void {
  cachedNav = undefined;
}

/** Options for {@link useScreenTracker}. */
export interface UseScreenTrackerOptions {
  /** Optional logger forwarded to `trackScreen`. */
  logger?: Logger;
  /** Optional sessionId stamped on the recorded events. */
  sessionId?: string;
}

/**
 * Records the current screen's mount and unmount events whenever it gains
 * or loses focus.
 *
 * Place this hook at the top of any screen component. Unlike a plain
 * `useEffect(() => {...}, [])`, this uses React Navigation's `useFocusEffect`
 * so it fires on tab switches where the component otherwise stays mounted.
 *
 * Requires `@react-navigation/native`. When the package is not installed the
 * hook is a silent no-op (one `console.warn` in `__DEV__`).
 *
 * @example
 * ```tsx
 * function AccountsScreen() {
 *   useScreenTracker({ logger });
 *   return <AccountsList />;
 * }
 * ```
 */
export function useScreenTracker(opts?: UseScreenTrackerOptions): void {
  const nav = getNav();
  // Hook count is stable across renders because `getNav()` returns the same
  // value forever (cached). Whichever branch React takes on first render is
  // the branch it takes for every subsequent render.
  if (nav === null) {
    // Peer absent — no hooks called below this point
    return;
  }

  const route = nav.useRoute();
  // `useFocusEffect` re-runs (cleanup + re-run) whenever the callback identity
  // changes. A fresh inline arrow each render would fire a spurious unmount +
  // re-mount on every re-render while focused, polluting screen tracking. Memoize
  // on a stable screen identity so it only re-runs on real focus changes (NAV-1).
  const effect = useCallback(
    () => {
      const unmount = trackScreen(route.name, route.params as Record<string, unknown> | undefined, {
        ...(opts?.logger !== undefined ? { logger: opts.logger } : {}),
        ...(opts?.sessionId !== undefined ? { sessionId: opts.sessionId } : {}),
      });
      return unmount;
    },
    // route.name is the stable screen identity; logger/sessionId are config that
    // rarely change. params intentionally excluded — re-tagging on every param
    // change would defeat the purpose.
    [route.name, opts?.logger, opts?.sessionId]
  );
  nav.useFocusEffect(effect);
}
