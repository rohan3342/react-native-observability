import type { Logger } from '../logger/Logger';
import { SelfLogger } from '../logger/internal/SelfLogger';

/**
 * React Native's global error hook. Present at runtime as `global.ErrorUtils`;
 * declared structurally here so the module parses on any platform.
 */
interface ErrorUtilsLike {
  getGlobalHandler?(): GlobalErrorHandler | undefined;
  setGlobalHandler(handler: GlobalErrorHandler): void;
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

/**
 * Minimal event-target shape — avoids a hard DOM-lib dependency so this module
 * parses on any platform (RN, Web, Node). Only the `unhandledrejection` path is
 * wired; `event` is typed `unknown` because the actual shape is host-specific.
 */
type EvListener = (event: unknown) => void;
interface EventTargetLike {
  addEventListener(type: string, listener: EvListener): void;
  removeEventListener(type: string, listener: EvListener): void;
}

/**
 * Hermes promise-rejection tracker. Present on `global.HermesInternal` when the
 * Hermes engine is active.
 */
interface HermesLike {
  enablePromiseRejectionTracker?(options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled?: (id: number) => void;
  }): void;
}

/** Options for {@link installGlobalErrorHandler}. */
export interface InstallGlobalErrorHandlerOptions {
  /**
   * When `true` (default), the previously-installed global handler is still
   * called after Observability logs — so Sentry/Crashlytics native handlers and
   * RedBox keep working. Set `false` to suppress the chain (rarely wanted).
   */
  chainPrevious?: boolean;
  /**
   * Capture unhandled promise rejections (layer 2). Default `true`. Uses
   * Hermes's tracker when available, else the global `unhandledrejection` event.
   */
  trackRejections?: boolean;
  /**
   * Seams for testing — injected globals. Defaults read from `globalThis`.
   * @internal
   */
  _errorUtils?: ErrorUtilsLike | undefined;
  _hermes?: HermesLike | undefined;
  _eventTarget?: EventTargetLike | undefined;
}

/**
 * Installs JS-level crash capture (plan S14, layers 1–2):
 *
 * - **Layer 1** — wraps `ErrorUtils.setGlobalHandler` so uncaught synchronous JS
 *   throws are forwarded to `logger.error(...)`. The previous handler is chained
 *   by default so native crash reporters and the dev RedBox still fire.
 * - **Layer 2** — captures unhandled promise rejections via Hermes's
 *   `enablePromiseRejectionTracker` when present, falling back to the global
 *   `unhandledrejection` event.
 *
 * Safe on any platform: every global is feature-detected, and the installer
 * never throws. Returns a teardown function that restores the previous handler
 * and removes the rejection listener.
 *
 * @returns a teardown function (idempotent).
 *
 * @example
 * ```ts
 * const uninstall = installGlobalErrorHandler(logger);
 * // ... later, e.g. in tests or teardown:
 * uninstall();
 * ```
 *
 * @stability stable
 */
export function installGlobalErrorHandler(
  logger: Logger,
  options: InstallGlobalErrorHandlerOptions = {}
): () => void {
  const chainPrevious = options.chainPrevious ?? true;
  const trackRejections = options.trackRejections ?? true;

  const g = globalThis as unknown as {
    ErrorUtils?: ErrorUtilsLike;
    HermesInternal?: HermesLike;
    addEventListener?: (type: string, listener: EvListener) => void;
    removeEventListener?: (type: string, listener: EvListener) => void;
  };

  const errorUtils = options._errorUtils ?? g.ErrorUtils;
  const hermes = options._hermes ?? g.HermesInternal;
  const eventTarget =
    options._eventTarget ??
    (typeof g.addEventListener === 'function' && typeof g.removeEventListener === 'function'
      ? { addEventListener: g.addEventListener, removeEventListener: g.removeEventListener }
      : undefined);

  const teardowns: Array<() => void> = [];

  // ── Layer 1: synchronous global handler ──────────────────────────────────
  if (errorUtils !== undefined) {
    const previous =
      chainPrevious && typeof errorUtils.getGlobalHandler === 'function'
        ? errorUtils.getGlobalHandler()
        : undefined;

    const handler: GlobalErrorHandler = (error, isFatal) => {
      try {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Uncaught JS error', err, { isFatal: isFatal === true, source: 'global' });
      } catch {
        // The handler must never throw — that would re-enter the global hook.
      }
      if (previous !== undefined) {
        // The chained handler is foreign code; if it throws it would re-enter
        // ErrorUtils during crash reporting (loop / confusing secondary crash).
        // Guard it the same way as our own logging body (audit EH-2).
        try {
          previous(error, isFatal);
        } catch (chainError) {
          SelfLogger.warn('Chained global error handler threw and was isolated', chainError);
        }
      }
    };

    try {
      errorUtils.setGlobalHandler(handler);
      teardowns.push(() => {
        if (previous !== undefined) errorUtils.setGlobalHandler(previous);
      });
    } catch {
      // Feature-detect failed at call time — skip silently.
    }
  }

  // ── Layer 2: unhandled promise rejections ────────────────────────────────
  if (trackRejections) {
    const onUnhandled = (error: unknown): void => {
      try {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Unhandled promise rejection', err, { source: 'rejection' });
      } catch {
        // never throw from the tracker
      }
    };

    if (hermes !== undefined && typeof hermes.enablePromiseRejectionTracker === 'function') {
      try {
        hermes.enablePromiseRejectionTracker({
          allRejections: true,
          onUnhandled: (_id, error) => onUnhandled(error),
        });
        // Hermes has no documented "disable" — teardown is a no-op for it.
      } catch {
        // ignore
      }
    } else if (eventTarget !== undefined) {
      const listener = (event: unknown): void => {
        const reason = (event as { reason?: unknown }).reason;
        onUnhandled(reason);
      };
      try {
        eventTarget.addEventListener('unhandledrejection', listener);
        teardowns.push(() => {
          eventTarget.removeEventListener('unhandledrejection', listener);
        });
      } catch {
        // ignore
      }
    }
  }

  let torn = false;
  return () => {
    if (torn) return;
    torn = true;
    for (const t of teardowns) {
      try {
        t();
      } catch {
        // teardown must never throw
      }
    }
  };
}
