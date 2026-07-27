import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { TextX, useTheme } from '../theme';
import type { Theme } from '../theme';

interface ToastApi {
  /** Show a brief, self-dismissing confirmation message. */
  show(message: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

// ~2.4s on screen — long enough to read a confirmation without lingering
// (audit M10; the toast-dismiss guideline is 3–5s, kept tighter for a dev tool).
const VISIBLE_MS = 2400;
const FADE_MS = 180;

/**
 * Lightweight toast host for the debug panel. Renders a single bottom-anchored
 * pill that fades in/out; provides {@link useToast} to descendants. Used to
 * confirm otherwise-invisible actions (copy/export open the OS share sheet,
 * which gives no in-app feedback).
 */
export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  // Pairs a small slide-up with the fade so the toast rises into view (M10).
  const translateY = useRef(new Animated.Value(8)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (msg: string) => {
      if (hideTimer.current !== null) clearTimeout(hideTimer.current);
      setMessage(msg);
      translateY.setValue(8);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      ]).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(() => setMessage(null));
      }, VISIBLE_MS);
    },
    [opacity, translateY]
  );

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {message !== null ? (
        <View pointerEvents="none" style={styles.host}>
          <Animated.View style={[styles.pill, { opacity, transform: [{ translateY }] }]}>
            <TextX variant="caption" tone="inverse" accessibilityLiveRegion="polite">
              {message}
            </TextX>
          </Animated.View>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

/**
 * Returns the toast API. Safe to call outside a {@link ToastProvider} — falls
 * back to a no-op so a custom panel UI without the provider never crashes.
 */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP_TOAST;
}

const NOOP_TOAST: ToastApi = { show: () => undefined };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    host: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: t.spacing.xxl + t.spacing.lg,
      alignItems: 'center',
    },
    pill: {
      backgroundColor: t.colors.text,
      paddingHorizontal: t.spacing.lg,
      paddingVertical: t.spacing.sm + 2,
      borderRadius: t.radii.pill,
      ...t.shadow,
    },
  });
}
