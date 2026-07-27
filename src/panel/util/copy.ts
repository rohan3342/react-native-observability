import { useCallback } from 'react';
import { Share } from 'react-native';
import { useToast } from '../components/Toast';
import { useHaptics } from './haptics';

/**
 * Returns a `copy(text, label?)` function that shares `text` via the OS share
 * sheet (the package ships no clipboard peer) and shows an in-app confirmation
 * toast. Centralises the share-with-feedback pattern used across the panel's
 * copy/export actions.
 *
 * @example
 * ```tsx
 * const copy = useCopy();
 * <Button label="Copy cURL" onPress={() => copy(entry.toCurl(), 'cURL')} />
 * ```
 */
export function useCopy(): (text: string, label?: string) => void {
  const toast = useToast();
  const haptics = useHaptics();
  return useCallback(
    (text: string, label?: string) => {
      if (text === '') return;
      Share.share({ message: text }).catch(() => undefined);
      haptics.impact();
      toast.show(label !== undefined ? `Copied ${label}` : 'Copied');
    },
    [toast, haptics]
  );
}
