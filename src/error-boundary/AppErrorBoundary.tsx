import React from 'react';
import { SelfLogger } from '../logger/internal/SelfLogger';
import type { AppErrorBoundaryProps, ErrorBoundaryFallbackProps } from './types';

interface State {
  error: Error | null;
}

/**
 * Root-level React error boundary for a React Native app.
 *
 * Catches synchronous render errors from any child component and either renders
 * a custom `FallbackComponent` or `null` while the error state is active.
 * When a `logger` prop is provided, every caught error is forwarded through it
 * to any configured observability adapters (Sentry, Crashlytics, etc.).
 *
 * **Why a class component:** `getDerivedStateFromError` and `componentDidCatch`
 * are class-only React lifecycle methods. Error boundaries cannot be function
 * components as of React 19.
 *
 * @example
 * ```tsx
 * <AppErrorBoundary
 *   logger={logger}
 *   FallbackComponent={({ error, retry }) => (
 *     <View><Text>{error.message}</Text><Button onPress={retry} title="Retry" /></View>
 *   )}
 * >
 *   <App />
 * </AppErrorBoundary>
 * ```
 */
export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, State> {
  state: State = { error: null };

  /**
   * Derives error state from a caught render error.
   * Called by React before the next render so the boundary can show a fallback.
   */
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  /**
   * Called after a descendant throws during rendering, lifecycle methods, or
   * constructors. Logs the error via the injected logger and invokes `onError`,
   * unless `isolate` is `true` — in which case the error is caught silently
   * (the fallback still renders, but no telemetry side-effects fire).
   */
  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (this.props.isolate === true) return;
    // logger.error is internally isolated and cannot throw; the user-supplied
    // onError callback can. Guard it so a buggy consumer handler can't turn a
    // recoverable render error into a fatal secondary crash (audit EH-1).
    this.props.logger?.error('AppErrorBoundary caught', error, {
      componentStack: info.componentStack ?? undefined,
    });
    try {
      this.props.onError?.(error, info);
    } catch (callbackError) {
      SelfLogger.warn('AppErrorBoundary onError callback threw and was isolated', callbackError);
    }
  }

  /**
   * Clears the error state, causing the boundary to re-render its children.
   * Pass this to the `FallbackComponent` as the `retry` prop.
   */
  retry = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const Fallback = this.props.FallbackComponent;
      if (Fallback) {
        return <Fallback error={error} retry={this.retry} />;
      }
      return null;
    }
    return this.props.children;
  }
}

export type { ErrorBoundaryFallbackProps };
