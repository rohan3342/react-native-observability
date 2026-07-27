import { createContext, useContext } from 'react';

/**
 * A minimal, **injected** haptics surface. The package ships no haptics
 * dependency (consistent with the zero-forced-dependency rule); a consumer that
 * already uses `expo-haptics` or `react-native-haptic-feedback` passes thin
 * adapters via `DebugPanelProvider.haptics`. When omitted, every call is a no-op.
 *
 * @example expo-haptics adapter
 * ```ts
 * import * as Haptics from 'expo-haptics';
 * const haptics = {
 *   impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
 *   notify: (type) =>
 *     Haptics.notificationAsync(
 *       type === 'error'
 *         ? Haptics.NotificationFeedbackType.Error
 *         : type === 'warning'
 *           ? Haptics.NotificationFeedbackType.Warning
 *           : Haptics.NotificationFeedbackType.Success
 *     ),
 * };
 * <DebugPanelProvider haptics={haptics} />
 * ```
 */
export interface PanelHaptics {
  /** A light impact — used for a successful copy / export confirmation. */
  impact?(): void;
  /** A notification cue — used for a destructive confirm (`'warning'`). */
  notify?(type: 'success' | 'warning' | 'error'): void;
}

const HapticsContext = createContext<PanelHaptics | null>(null);

export const HapticsProvider = HapticsContext.Provider;

/**
 * Returns a haptics API that's always safe to call: it forwards to the injected
 * {@link PanelHaptics} when present, and is a no-op otherwise (and never throws,
 * so a consumer adapter that throws can't break a panel action).
 */
export function useHaptics(): Required<PanelHaptics> {
  const injected = useContext(HapticsContext);
  return {
    impact: () => {
      try {
        injected?.impact?.();
      } catch {
        // best-effort — haptics must never break an action
      }
    },
    notify: type => {
      try {
        injected?.notify?.(type);
      } catch {
        // best-effort
      }
    },
  };
}
