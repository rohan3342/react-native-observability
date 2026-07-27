import type { Logger } from '../../logger/Logger';
import { trackScreen } from '../../integrations/screen';

/** Minimal React Navigation route shape. */
interface MinimalRoute {
  name: string;
  params?: unknown;
  key?: string;
}

/** Minimal `NavigationContainerRef` interface — only the field this observer reads. */
interface MinimalNavigationRef {
  getCurrentRoute?: () => MinimalRoute | undefined;
}

/** Options for {@link observeReactNavigation}. */
export interface ObserveReactNavigationOptions {
  /** Optional logger forwarded to `trackScreen` for screen:mount/unmount logs. */
  logger?: Logger;
  /** Optional sessionId stamped on every screen event. */
  sessionId?: string;
}

/** Returned by {@link observeReactNavigation}. */
export interface ReactNavigationObserver {
  /**
   * Attach to `<NavigationContainer onStateChange={observer.onStateChange}>`.
   * On every navigation, the previously-tracked screen receives its unmount
   * event and the new screen receives a mount event.
   */
  onStateChange(state?: unknown): void;
  /**
   * Manually fire the dangling unmount for the currently-tracked screen.
   * Call this on app teardown so the last screen's time-on-screen is recorded.
   */
  dispose(): void;
}

/**
 * Creates an observer that maps React Navigation state changes into
 * provider-agnostic `trackScreen` calls.
 *
 * Knows nothing about the panel UI or the logger pipeline beyond the
 * `Logger` it forwards to `trackScreen`. The observer holds one in-flight
 * unmount callback so that navigating from screen A to screen B records:
 *
 *   1. unmount(A) — fires the callback returned when A was mounted
 *   2. mount(B)   — calls `trackScreen(B, ...)`
 *
 * @example
 * ```tsx
 * import { createNavigationContainerRef } from '@react-navigation/native';
 * import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';
 *
 * const navRef = createNavigationContainerRef();
 * const nav = observeReactNavigation(navRef, { logger });
 *
 * <NavigationContainer ref={navRef} onStateChange={nav.onStateChange}>
 *   {/* ... *\/}
 * </NavigationContainer>
 * ```
 */
export function observeReactNavigation(
  navigationRef: { current: MinimalNavigationRef | null } | MinimalNavigationRef,
  opts: ObserveReactNavigationOptions = {}
): ReactNavigationObserver {
  let pendingUnmount: (() => void) | null = null;
  let lastRouteKey: string | undefined;

  function resolveRef(): MinimalNavigationRef | null {
    if ('current' in navigationRef) return navigationRef.current;
    return navigationRef;
  }

  function onStateChange(): void {
    const ref = resolveRef();
    const route = ref?.getCurrentRoute?.();
    if (!route) return;

    // Use route.key when present (each navigation push gets a unique key) so
    // re-entering the same screen records as a fresh mount. Fall back to name
    // when the navigator does not surface a key.
    const id = route.key ?? route.name;
    if (id === lastRouteKey) return;

    if (pendingUnmount !== null) pendingUnmount();
    lastRouteKey = id;

    pendingUnmount = trackScreen(route.name, route.params as Record<string, unknown> | undefined, {
      ...(opts.logger !== undefined ? { logger: opts.logger } : {}),
      ...(opts.sessionId !== undefined ? { sessionId: opts.sessionId } : {}),
    });
  }

  function dispose(): void {
    if (pendingUnmount !== null) {
      pendingUnmount();
      pendingUnmount = null;
    }
    lastRouteKey = undefined;
  }

  return { onStateChange, dispose };
}
