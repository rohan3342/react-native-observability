import { useContext } from 'react';
import { DebugPanelContext } from './DebugPanelProvider';
import type { DebugPanelContextValue } from './types';

/**
 * Returns the debug panel's state and actions.
 *
 * Must be called inside a `<DebugPanelProvider>` subtree. Calling outside
 * the provider throws — silent fall-through would mask a wiring bug.
 *
 * @example
 * ```tsx
 * const { openPanel, isOpen } = useDebugPanel();
 * ```
 */
export function useDebugPanel(): DebugPanelContextValue {
  const ctx = useContext(DebugPanelContext);
  if (ctx === null) {
    throw new Error(
      '[observability] useDebugPanel() called outside a <DebugPanelProvider>. ' +
        'Wrap your app in <DebugPanelProvider> before calling this hook.'
    );
  }
  return ctx;
}
