import { useCallback, useState } from 'react';

/**
 * Returns a handler function that propagates an error to the nearest React
 * error boundary, even when thrown from an async context.
 *
 * **How it works:** Calling `setState` with an updater function that throws
 * causes React's scheduler to catch and forward the error to the boundary —
 * the same mechanism used for synchronous render errors.
 *
 * @returns A stable callback `(error: Error) => void`. Call it inside
 *   `try/catch` blocks in async event handlers, effects, or callbacks.
 *
 * @example
 * ```tsx
 * const handleError = useErrorHandler();
 *
 * const onSubmit = async () => {
 *   try {
 *     await submitPayment();
 *   } catch (err) {
 *     handleError(err as Error); // Triggers nearest ScreenErrorBoundary
 *   }
 * };
 * ```
 */
export function useErrorHandler(): (error: Error) => void {
  const [, setState] = useState<null>(null);
  return useCallback((error: Error) => {
    setState(() => {
      throw error;
    });
  }, []);
}
