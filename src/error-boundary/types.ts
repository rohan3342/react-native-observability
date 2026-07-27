import type React from 'react';
import type { Logger } from '../logger/Logger';

/**
 * Props passed to a custom `FallbackComponent` by `AppErrorBoundary`.
 */
export interface ErrorBoundaryFallbackProps {
  /** The error that was caught. */
  error: Error;
  /** Call to clear the error and re-render the original component tree. */
  retry: () => void;
}

/**
 * Props accepted by `AppErrorBoundary`.
 */
export interface AppErrorBoundaryProps {
  /** The subtree to protect. */
  children: React.ReactNode;
  /**
   * Optional Observability logger. When provided, caught errors are forwarded
   * to `logger.error()` (and from there to any configured adapters).
   * Ignored when `isolate` is `true`.
   */
  logger?: Logger;
  /**
   * Called every time the boundary catches an error.
   * Use to forward to an adapter manually or trigger analytics.
   * Ignored when `isolate` is `true`.
   */
  onError?: (error: Error, info: React.ErrorInfo) => void;
  /**
   * Custom fallback UI rendered when the boundary catches.
   * When omitted the boundary renders `null` — provide a fallback in production apps.
   */
  FallbackComponent?: React.ComponentType<ErrorBoundaryFallbackProps>;
  /**
   * When `true`, errors caught by this boundary are NOT forwarded to `logger`
   * or `onError`. The fallback is still rendered and `retry()` still works.
   *
   * Use to sandbox a subtree (e.g. a third-party widget) whose errors should
   * not pollute the app's telemetry stream. Default: `false`.
   */
  isolate?: boolean;
}

/**
 * Props accepted by `ScreenErrorBoundary`.
 * Extends `AppErrorBoundaryProps` with navigation-aware reset support.
 */
export interface ScreenErrorBoundaryProps extends AppErrorBoundaryProps {
  /**
   * When `true` and `@react-navigation/native` is installed, the boundary
   * resets automatically when the user navigates away from the screen.
   * Silently ignored if `@react-navigation/native` is not installed.
   * Default: `false`.
   */
  resetOnBlur?: boolean;
}
