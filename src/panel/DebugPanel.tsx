import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  findNodeHandle,
  useWindowDimensions,
} from 'react-native';
import type { View as RNView, ViewStyle } from 'react-native';
import { usePanelInsets } from './util/usePanelInsets';
import { useReduceMotion } from './util/useReduceMotion';
import { Overlay } from './components/Overlay';
import { EmptyState } from './components/EmptyState';
import { ReadOnlyBanner } from './components/ReadOnlyBanner';
import { SessionSelectorButton, SessionPickerOverlay } from './components/SessionSelector';
import { TabBar } from './components/TabBar';
import { ToastProvider } from './components/Toast';
import { Icon } from './icons';
import { LogsTab } from './tabs/LogsTab';
import { NavigationTab } from './tabs/NavigationTab';
import { NetworkTab } from './tabs/NetworkTab';
import { PerformanceTab } from './tabs/PerformanceTab';
import { SettingsTab } from './tabs/SettingsTab';
import { StateTab } from './tabs/StateTab';
import { TextX, useTheme } from './theme';
import type { Theme } from './theme';
import { useDebugPanel } from './useDebugPanel';
import type { DebugPanelTab } from './types';

/**
 * Full-screen modal that hosts the panel chrome and the active tab body.
 *
 * Mounted by `DebugPanelProvider` only while `isOpen` is true — the modal
 * tree is not present in the React tree when the panel is closed, so no
 * tab subscriptions run idle.
 */
export function DebugPanel(): React.ReactElement {
  const {
    isOpen,
    closePanel,
    activeTab,
    setActiveTab,
    tabs,
    branding,
    safeAreaInsets,
    selectedSessionId,
  } = useDebugPanel();
  const t = useTheme();
  const styles = useMemo(() => buildStyles(t), [t]);

  // Real device safe-area insets when the consumer supplied them (e.g. from
  // react-native-safe-area-context via DebugPanelProvider.safeAreaInsets);
  // otherwise a platform estimate. Top pads the chrome; bottom clears the
  // home-gesture bar. Replaces the old static spacing.safeTop.
  const insets = usePanelInsets(safeAreaInsets);

  // Tablet / large-screen adaptation: cap + centre the panel so lists don't
  // stretch edge-to-edge on iPads and the content keeps a readable measure.
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  // Swipe-down-to-dismiss on the header/grabber: the panel now follows the
  // finger as it drags down, then either springs back or settles off-screen and
  // closes (mobile sheet idiom). Refs keep the responder — created once —
  // reading current values without re-creating handlers.
  const reduceMotion = useReduceMotion();
  const { height: screenH } = useWindowDimensions();
  const dragY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(closePanel);
  closeRef.current = closePanel;
  const screenHRef = useRef(screenH);
  screenHRef.current = screenH;
  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Only claim the gesture once it's clearly a downward drag, so taps on
        // header controls (session pill, close) still work.
        onMoveShouldSetPanResponder: (_e, g) => g.dy > 8 && g.dy > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (reduceMotionRef.current) return;
          // Track the finger downward; resist upward drags with a rubber band so
          // the panel can't be pulled above its resting position.
          dragY.setValue(g.dy >= 0 ? g.dy : g.dy / 4);
        },
        onPanResponderRelease: (_e, g) => {
          // Past the threshold (or a fast flick) → settle off-screen, then close.
          const dismiss = g.dy > 120 || (g.dy > 40 && g.vy > 0.5);
          if (reduceMotionRef.current) {
            dragY.setValue(0);
            if (dismiss) closeRef.current();
            return;
          }
          if (dismiss) {
            Animated.timing(dragY, {
              toValue: screenHRef.current,
              duration: 180,
              useNativeDriver: true,
            }).start(() => {
              closeRef.current();
              dragY.setValue(0);
            });
          } else {
            // Snap back to rest with a spring.
            Animated.spring(dragY, {
              toValue: 0,
              damping: 22,
              stiffness: 260,
              mass: 0.9,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [dragY]
  );

  // Session-picker open state lives here so the picker overlay can render at the
  // panel root (full-screen) rather than inside the small header row, where its
  // absolute-fill Overlay would be clipped to the header box.
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false);

  // Move VoiceOver/TalkBack focus to the panel header when it opens, so screen-
  // reader users land in the panel instead of wherever focus was (audit G8).
  const headerRef = useRef<RNView | null>(null);
  useEffect(() => {
    if (!isOpen) return;
    const node = headerRef.current ? findNodeHandle(headerRef.current) : null;
    if (node != null && typeof AccessibilityInfo?.setAccessibilityFocus === 'function') {
      // Defer a tick so the node is laid out before focusing.
      const id = setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 80);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [isOpen]);

  // Header branding — Observability defaults unless the consumer overrides.
  const logo = branding?.logo ?? '🩺';
  const title = branding?.title ?? 'Observability';
  const subtitle = branding?.subtitle;

  // Fade the panel slightly as it's dragged toward dismissal (there's no scrim
  // to dim, so the surface itself signals the gesture's progress).
  const dragOpacity = dragY.interpolate({
    inputRange: [0, 240],
    outputRange: [1, 0.85],
    extrapolate: 'clamp',
  });

  return (
    <Overlay visible={isOpen} onRequestClose={closePanel} placement="fill" scrim={false}>
      <ToastProvider>
        <Animated.View
          style={[
            styles.root,
            isWide && styles.rootWide,
            { transform: [{ translateY: dragY }], opacity: dragOpacity },
          ]}
        >
          <View style={[styles.chrome, { paddingTop: insets.top }]} {...panResponder.panHandlers}>
            {/* Grabber: a visible affordance that the panel can be swiped down to
                dismiss (and the drag region for that gesture). */}
            <View
              style={styles.grabberRow}
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <View style={styles.grabber} />
            </View>
            <View style={styles.header}>
              <View
                ref={headerRef}
                style={styles.headerTitle}
                accessible
                accessibilityRole="header"
              >
                <TextX variant="display" accessibilityRole="header" numberOfLines={1}>
                  {`${logo}${logo !== '' ? ' ' : ''}${title}`}
                </TextX>
                {subtitle !== undefined ? (
                  <TextX variant="caption" tone="muted" numberOfLines={1}>
                    {subtitle}
                  </TextX>
                ) : null}
              </View>
              <View style={styles.headerActions}>
                <SessionSelectorButton onOpen={() => setSessionPickerOpen(true)} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close debug panel"
                  onPress={closePanel}
                  // 28pt visual + 10pt hitSlop each side = 48pt tap target (≥44pt).
                  hitSlop={10}
                  style={({ pressed }) => [styles.closeBtn, pressed && pressedOverlay]}
                >
                  <Icon name="close" size={13} tone="muted" decorative />
                </Pressable>
              </View>
            </View>

            <TabBar tabs={tabs} active={activeTab} onSelect={setActiveTab} />
          </View>

          <View style={[styles.body, { paddingBottom: t.spacing.lg + insets.bottom }]}>
            {renderTabBody(activeTab, selectedSessionId !== undefined)}
          </View>

          {/* Rendered at the panel root (not the header) so its full-screen
              overlay fills the panel and isn't clipped to the header row. */}
          <SessionPickerOverlay
            open={sessionPickerOpen}
            onClose={() => setSessionPickerOpen(false)}
          />
        </Animated.View>
      </ToastProvider>
    </Overlay>
  );
}

function renderTabBody(tab: DebugPanelTab, viewingPast: boolean): React.ReactElement {
  // Only Logs are persisted per-session today, so only it can show a past
  // session's data. The other live tabs would otherwise mislead by showing the
  // CURRENT session's data while the header says a past one is selected — so
  // they explain that instead. Settings stays available (session metadata).
  if (viewingPast && tab !== 'logs' && tab !== 'settings') {
    return <NotPersistedForPast />;
  }
  switch (tab) {
    case 'logs':
      return <LogsTab />;
    case 'network':
      return <NetworkTab />;
    case 'state':
      return <StateTab />;
    case 'navigation':
      return <NavigationTab />;
    case 'settings':
      return <SettingsTab />;
    case 'performance':
      return <PerformanceTab />;
  }
}

/** Shown on non-Logs tabs while a past session is selected (only logs persist). */
function NotPersistedForPast(): React.ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <ReadOnlyBanner />
      <EmptyState
        icon="clock"
        title="Not recorded for past sessions"
        hint="Only logs are persisted per session. Switch back to the live session (header selector) to inspect network, state, navigation, and performance."
      />
    </View>
  );
}

const pressedOverlay: ViewStyle = { opacity: 0.7 };

function buildStyles(t: Theme) {
  return StyleSheet.create({
    // Fills the Overlay's full-viewport layer. The Overlay (not a native
    // <Modal>) owns absolute positioning + the safe full-screen guarantee, so
    // this just paints the panel surface and stacks chrome over the body.
    root: {
      flex: 1,
      backgroundColor: t.colors.surface,
    },
    // Tablet / large screens: cap width + centre so lists keep a readable
    // measure instead of stretching edge-to-edge (and a hairline frame).
    rootWide: {
      maxWidth: 760,
      width: '100%',
      alignSelf: 'center',
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: t.colors.border,
    },
    chrome: {
      // paddingTop applied at render time from real safe-area insets.
      backgroundColor: t.colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.colors.border,
    },
    grabberRow: { alignItems: 'center', paddingTop: t.spacing.sm },
    grabber: {
      width: 36,
      height: 5,
      borderRadius: t.radii.pill,
      backgroundColor: t.colors.borderStrong,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: t.spacing.lg,
      paddingTop: t.spacing.sm,
      paddingBottom: t.spacing.sm + 2,
      gap: t.spacing.md,
    },
    headerTitle: { flex: 1, gap: 1, marginRight: t.spacing.md },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md - 2 },
    closeBtn: {
      width: 28,
      height: 28,
      borderRadius: t.radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: t.colors.surfaceSubtle,
    },
    // paddingBottom applied at render time (spacing.lg + bottom inset).
    body: { flex: 1, paddingTop: t.spacing.lg, paddingHorizontal: t.spacing.lg },
  });
}
