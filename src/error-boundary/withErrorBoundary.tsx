import React from 'react';
import { AppErrorBoundary } from './AppErrorBoundary';
import type { AppErrorBoundaryProps } from './types';

/**
 * Higher-order component that wraps any component in an `AppErrorBoundary`.
 *
 * @param Component - The component to protect.
 * @param options - `AppErrorBoundaryProps` minus `children` — forwarded to the boundary.
 * @returns A new component with an error boundary applied.
 *
 * @example
 * ```tsx
 * const SafeCheckout = withErrorBoundary(CheckoutScreen, {
 *   logger,
 *   FallbackComponent: ErrorFallback,
 * });
 * ```
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<AppErrorBoundaryProps, 'children'> = {}
): React.FC<P> {
  const displayName = Component.displayName || Component.name || 'Component';

  const Wrapped: React.FC<P> = props => (
    <AppErrorBoundary {...options}>
      <Component {...props} />
    </AppErrorBoundary>
  );

  Wrapped.displayName = `withErrorBoundary(${displayName})`;
  return Wrapped;
}
