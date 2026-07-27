/**
 * Observability EXPO example — a multi-screen showcase of the full Expo Go-safe
 * surface, wired with React Navigation so the panel's per-screen filtering
 * (Track 5) has real data.
 *
 * Everything here works in Expo Go with NO native build:
 *  - Logger: createLogger + Console/Memory transports, all levels, namespaces
 *  - installGlobalErrorHandler  (uncaught errors + unhandled rejections)
 *  - installConsoleProxy        (route console.* through the logger)
 *  - A custom adapter via createCustomAdapter (pure JS — no native SDK needed)
 *  - HTTP: createHttpObserver + observeAxios + observeFetch (GET/POST/PUT/DEL/fail)
 *  - Network MOCKING: createMockEngine (block / mimic) + the panel "Rules" UI
 *  - SCREEN TAGGING: observeReactNavigation feeds the screen store, and
 *    createScreenProvider() (wired in src/observability.ts) tags every log + network
 *    entry with the active screen using an idle window. The Attribution tab
 *    showcases all three cases (owned / global-null / explicit-other-screen).
 *  - State slices of varied shapes + live feature-flag toggles (Home)
 *  - Performance: trackPerformance() spans + the Performance tab (Errors)
 *  - Branding + runtime light/dark/system switch (Settings → Appearance)
 *  - AppErrorBoundary at the root; multi-tap (5×, top-right) to open the panel
 *
 * MMKV PERSISTENCE (dev build) — src/observability.ts wires react-native-mmkv
 * fail-soft: in an Expo **dev build** (`npx expo run:ios` / EAS) it persists logs
 * (MMKVTransport), correlates + crash-detects sessions (SessionManager), persists
 * panel prefs, and recovers the breadcrumb crash trail across launches. In Expo
 * Go (no native module) it cleanly falls back to in-memory. The Home screen's
 * "Storage & sessions" card shows which mode is active.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ STILL EXPO-GO-LIMITED — shake-to-open requires the accelerometer native  │
 * │ module. See ../bare for the full native surface wired unconditionally.   │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppErrorBoundary } from 'react-native-observability';
import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';
import { DebugPanelProvider } from 'react-native-observability/panel';
import type { IconSet } from 'react-native-observability/panel';

import {
  clearPersistentStorage,
  getSessionLogs,
  http,
  logger,
  memoryTransport,
  mockEngine,
  panelPersist,
} from './src/observability';
import { useTheme } from './src/theme';
import { ErrorFallback, type IconName } from './src/ui';
import { HomeScreen } from './src/screens/HomeScreen';
import { NetworkScreen } from './src/screens/NetworkScreen';
import { LogsScreen } from './src/screens/LogsScreen';
import { ErrorsScreen } from './src/screens/ErrorsScreen';
import { AttributionScreen } from './src/screens/AttributionScreen';

const Tab = createBottomTabNavigator();

// Per-tab icons (outline when inactive, filled when focused) — Ionicons.
const TAB_ICON: Record<string, { on: IconName; off: IconName }> = {
  Home: { on: 'home', off: 'home-outline' },
  Network: { on: 'globe', off: 'globe-outline' },
  Logs: { on: 'list', off: 'list-outline' },
  Errors: { on: 'flash', off: 'flash-outline' },
  Attribution: { on: 'locate', off: 'locate-outline' },
};

// Demonstrates the injectable panel icon set: swap a few of the panel's built-in
// glyphs for crisp Ionicons. Each renderer gets the size + colour the panel
// resolved from its tokens, so the vector icons match the rest of the UI. Names
// we don't map fall back to the built-in Unicode glyph — the package stays
// dependency-free; the consumer injects whichever icon library it already uses.
const panelIcons: IconSet = {
  close: ({ size, color }) => <Ionicons name="close" size={size} color={color} />,
  search: ({ size, color }) => <Ionicons name="search" size={size} color={color} />,
  copy: ({ size, color }) => <Ionicons name="copy-outline" size={size} color={color} />,
  refresh: ({ size, color }) => <Ionicons name="refresh" size={size} color={color} />,
  share: ({ size, color }) => <Ionicons name="share-outline" size={size} color={color} />,
};

// Nav ref + observer: every tab switch mounts/unmounts a screen in the screen
// store, which (a) populates the Navigation tab and (b) drives the active-screen
// resolution that tags logs + network entries (Track 5, via createScreenProvider
// wired in src/observability.ts).
const navRef = createNavigationContainerRef();
const nav = observeReactNavigation(navRef, { logger });

/**
 * The themed tab navigator. Split out so it can read `useTheme()` (the demo
 * follows the system colour scheme) and paint the nav chrome — header, tab bar,
 * and per-tab icons — to match the app surfaces.
 */
function Tabs() {
  const t = useTheme();
  const navTheme: NavTheme = {
    ...(t.mode === 'dark' ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.mode === 'dark' ? DarkTheme : DefaultTheme).colors,
      primary: t.colors.accent,
      background: t.colors.bg,
      card: t.colors.surface,
      text: t.colors.text,
      border: t.colors.border,
    },
  };

  return (
    <NavigationContainer ref={navRef} theme={navTheme} onStateChange={nav.onStateChange}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: true,
          headerTitleStyle: { fontWeight: '800' },
          tabBarActiveTintColor: t.colors.accent,
          tabBarInactiveTintColor: t.colors.textSubtle,
          tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
          tabBarIcon: ({ focused, color, size }) => {
            const icon = TAB_ICON[route.name] ?? { on: 'ellipse', off: 'ellipse-outline' };
            return <Ionicons name={focused ? icon.on : icon.off} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Network" component={NetworkScreen} />
        <Tab.Screen name="Logs" component={LogsScreen} />
        <Tab.Screen name="Errors" component={ErrorsScreen} />
        <Tab.Screen name="Attribution" component={AttributionScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  // Fire the initial screen's mount once the container is ready (onStateChange
  // covers subsequent transitions). Record the dangling unmount on teardown.
  useEffect(() => {
    nav.onStateChange();
    return () => nav.dispose();
  }, []);

  // Nesting order matters:
  // - SafeAreaProvider stays mounted at the root so the error fallback (which
  //   uses SafeAreaView) has context even after the navigator unmounts.
  // - The DebugPanelProvider wraps the boundary so the panel survives a render
  //   error — you can still open it to inspect the logs/network that led to the
  //   crash. The boundary then wraps just the app content.
  // SafeAreaProvider at the root; the panel's chrome reads real insets via
  // AppContent (which calls useSafeAreaInsets inside the provider).
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

/**
 * Inner content — lives inside `SafeAreaProvider` so it can read real safe-area
 * insets and hand them to `DebugPanelProvider` (the library doesn't depend on
 * react-native-safe-area-context itself; the consumer injects the value).
 */
function AppContent() {
  const insets = useSafeAreaInsets();
  return (
    <DebugPanelProvider
      enabled
      // Show the opt-in Performance tab alongside the defaults.
      tabs={['logs', 'network', 'state', 'navigation', 'performance', 'settings']}
      logSource={memoryTransport}
      networkSource={http.store}
      mockEngine={mockEngine}
      openOn={['multiTap']}
      multiTapCount={5}
      gestureTab="logs"
      persist={panelPersist}
      // Lets Settings → Actions clear MMKV (and folds into "Clear all").
      onClearStorage={clearPersistentStorage}
      // Real device safe-area insets so the panel clears the notch / gesture bar.
      safeAreaInsets={insets}
      // Lets the header session selector show a past session's persisted logs.
      getSessionLogs={getSessionLogs}
      // Swap a few built-in glyphs for Ionicons (injected — no forced dep).
      iconSet={panelIcons}
      // Haptics are injectable too (omitted here to avoid the extra native peer).
      // With expo-haptics installed:
      //   haptics={{
      //     impact: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      //     notify: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
      //   }}
      branding={{ title: 'Observability', subtitle: 'expo example' }}
      // Mode defaults to 'system'; switch Light/Dark/System live from
      // Settings → Appearance. (Note: a colour-only preset like
      // `themePresets.midnight` hardcodes dark surfaces, so it would override
      // the light palette — pair such presets with mode="dark", not a switcher.)
    >
      <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
        <View style={{ flex: 1 }}>
          <StatusBar style="auto" />
          <Tabs />
        </View>
      </AppErrorBoundary>
    </DebugPanelProvider>
  );
}
