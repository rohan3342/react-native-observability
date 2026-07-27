import React, { createContext, useCallback, useMemo, useRef, useState } from 'react';
import { getScreenStore } from '../integrations/screen';
import { DebugPanel } from './DebugPanel';
import { MultiTapTarget, useShakeDetector } from './gestures';
import type { AccelerometerSource } from './gestures';
import { PanelPrefsProvider } from './PanelPrefs';
import type { PanelPersistence } from './PanelPrefs';
import { SliceRegistry } from './SliceRegistry';
import { ThemeProvider } from './theme';
import type { PartialTheme, ThemeMode, ThemeDensity, themePresets } from './theme';
import { IconSetProvider } from './icons';
import type { IconSet } from './icons';
import { HapticsProvider } from './util/haptics';
import type { PanelHaptics } from './util/haptics';
import { DEFAULT_TABS } from './types';
import type {
  DebugPanelContextValue,
  DebugPanelTab,
  LogSource,
  NetworkSource,
  PanelBranding,
  ScreenSource,
} from './types';
import type { MockEngine } from '../integrations/http';
import type { LogEntry } from '../logger/types';

/**
 * React context distributing the panel's state and actions.
 *
 * Consumers do not read this directly — use {@link useDebugPanel} instead.
 *
 * @internal
 */

export const DebugPanelContext = createContext<DebugPanelContextValue | null>(null);

export interface DebugPanelProviderProps {
  /** Subtree the provider wraps. */
  children: React.ReactNode;
  /**
   * Whether the panel is mountable at runtime. When `false`, the provider
   * still wraps its children but `openPanel()` is a no-op and the modal
   * never mounts. Useful for production builds.
   * Default: `true`.
   */
  enabled?: boolean;
  /**
   * Which primary tabs appear in the tab bar, in order.
   * Default: all five — Logs, Network, State, Navigation, Settings.
   */
  tabs?: readonly DebugPanelTab[];
  /**
   * Tab shown the first time the panel opens. Defaults to the first entry
   * in `tabs`.
   */
  initialTab?: DebugPanelTab;
  /**
   * Source for the Logs tab — typically a `MemoryTransport` instance.
   * When omitted, the Logs tab shows an "unconfigured" empty state.
   */
  logSource?: LogSource;
  /**
   * Source for the Network tab — typically `httpObserver.store`.
   * When omitted, the Network tab shows an "unconfigured" empty state.
   */
  networkSource?: NetworkSource;
  /**
   * Source for the Navigation tab. Defaults to the singleton
   * `getScreenStore()` populated by `trackScreen()` — pass an override only
   * when you need to swap the screen store (e.g. for tests).
   */
  screenSource?: ScreenSource;
  /**
   * Gestures that open the panel. Defaults to `[]` — no automatic opening,
   * consumers call `useDebugPanel().openPanel()` themselves.
   *
   * - `'shake'` requires {@link accelerometer} to be provided.
   * - `'multiTap'` mounts a {@link MultiTapTarget} in the top-right corner
   *   that opens the panel after {@link multiTapCount} rapid taps.
   */
  openOn?: readonly ('shake' | 'multiTap')[];
  /**
   * Accelerometer source for the `'shake'` gesture. Required when `openOn`
   * includes `'shake'`. Any object with an `addListener({x,y,z})` shape
   * works — Expo's `Accelerometer`, a `react-native-sensors` wrapper, etc.
   * See {@link useShakeDetector} for details.
   */
  accelerometer?: AccelerometerSource;
  /** Taps needed for the multi-tap gesture. Default: `5`. */
  multiTapCount?: number;
  /** Max ms between consecutive taps for multi-tap. Default: `300`. */
  multiTapMaxDelayMs?: number;
  /**
   * Tab opened by the shake/multi-tap gesture. Default: the first entry in
   * {@link tabs}.
   */
  gestureTab?: DebugPanelTab;
  /**
   * Color-scheme selection for the panel UI. Defaults to `'system'` — the
   * panel follows the OS appearance and reacts to live changes. Set to
   * `'light'` or `'dark'` to pin a single mode (useful for screenshots or
   * brand-aligned debug panels).
   */
  mode?: ThemeMode;
  /**
   * Interface density. `'comfortable'` (default) sizes interactive controls to
   * the 44pt touch minimum; `'compact'` restores a denser devtools layout for
   * power users. Only sizing tokens scale — colours and type are unchanged.
   */
  density?: ThemeDensity;
  /**
   * Partial theme overrides deep-merged over the active default palette.
   * Pass any subset — only the slots you set are replaced.
   *
   * @example
   * ```tsx
   * <DebugPanelProvider theme={{ colors: { accent: '#ff3b30' } }}>
   * ```
   */
  theme?: PartialTheme;
  /**
   * A named theme preset — sugar over `theme`. One of `midnight` / `paper` /
   * `highContrast` from `themePresets`. Merged before `theme`, so an explicit
   * `theme` slot still wins. Pair surface-changing presets with a matching `mode`.
   *
   * @example
   * ```tsx
   * <DebugPanelProvider preset="highContrast" mode="light" />
   * ```
   */
  preset?: keyof typeof themePresets;
  /**
   * Custom font families (injected — no bundled font dependency). `sans` applies
   * to all UI text; `mono` to data (JSON, URLs, level tags). Omit either to keep
   * the default (system sans / `Menlo`).
   *
   * @example
   * ```tsx
   * <DebugPanelProvider fonts={{ sans: 'Inter', mono: 'JetBrains Mono' }} />
   * ```
   */
  fonts?: { readonly sans?: string; readonly mono?: string };
  /**
   * Swap individual icons for the host app's own vector set, keeping the package
   * dependency-free (icons are injected, never imported here). Each renderer
   * receives the resolved `size` + `color` so it matches the built-in glyphs;
   * unset names fall back to the Unicode glyph.
   *
   * @example
   * ```tsx
   * import { X } from 'lucide-react-native';
   * <DebugPanelProvider iconSet={{ close: ({ size, color }) => <X size={size} color={color} /> }} />
   * ```
   */
  iconSet?: IconSet;
  /**
   * Optional **injected** haptics (the package ships no haptics dependency). When
   * provided, the panel fires a light impact on a successful copy / export and a
   * warning notification before a destructive "Clear all". Omit for no haptics.
   * See {@link PanelHaptics} for an `expo-haptics` adapter.
   */
  haptics?: PanelHaptics;
  /**
   * Replace the entire panel UI while keeping the data wiring. When provided,
   * this component is rendered instead of the built-in `DebugPanel` whenever the
   * panel is open. It receives no props — read panel state via `useDebugPanel()`
   * from inside it (it renders within the provider + theme context).
   *
   * @example
   * ```tsx
   * <DebugPanelProvider panelComponent={MyCustomPanel} logSource={mem}>
   * ```
   */
  panelComponent?: React.ComponentType;
  /**
   * Optional synchronous persistence for the panel's UI preferences (active
   * tab, filter selections). When provided, those survive app restarts; when
   * omitted they live in memory only (surviving a panel close within a
   * session). See {@link PanelPersistence} for an MMKV adapter example. The
   * core ships no storage dependency — this is injected.
   */
  persist?: PanelPersistence;
  /**
   * Header branding (title / subtitle / logo glyph). Omit for the Observability
   * defaults. Rebrand the in-app panel without replacing the whole UI.
   *
   * @example
   * ```tsx
   * <DebugPanelProvider branding={{ title: 'Acme Debug', subtitle: 'staging', logo: '🐝' }} />
   * ```
   */
  branding?: PanelBranding;
  /**
   * Network mock engine (from `createMockEngine`). When provided, the Network
   * tab shows a "Rules" view for blocking/mocking requests and a "Mock this"
   * action on captured requests. Pass the **same** engine instance you wired
   * into `observeAxios`/`observeFetch` so panel edits affect live requests.
   */
  mockEngine?: MockEngine;
  /**
   * Optional callback to clear the app's **persistent** storage (the MMKV
   * instance backing `MMKVTransport` / `SessionManager` / breadcrumb trails).
   * The panel can't reach that instance itself, so you supply it. When given,
   * Settings → Actions shows a "Clear persisted storage" button and the existing
   * "Clear all" also calls this. Omit when there's no persistence (e.g. Expo Go).
   *
   * @example
   * ```tsx
   * <DebugPanelProvider onClearStorage={() => mmkv.clearAll()} />
   * ```
   */
  onClearStorage?: () => void;
  /**
   * Real device safe-area insets, so the panel header clears the notch / Dynamic
   * Island and bottom content clears the home-gesture bar. Pass
   * `useSafeAreaInsets()` from `react-native-safe-area-context` (the library does
   * **not** depend on it — a dynamic require of a native peer fails under Metro).
   * When omitted, the panel uses a sensible platform estimate.
   *
   * @example
   * ```tsx
   * import { useSafeAreaInsets } from 'react-native-safe-area-context';
   * const insets = useSafeAreaInsets();
   * <DebugPanelProvider safeAreaInsets={insets} />
   * ```
   */
  safeAreaInsets?: { top?: number; bottom?: number; left?: number; right?: number };
  /**
   * Reader for a **past** session's persisted logs, so selecting a prior session
   * in the header shows that session's logs (read-only) while the live session
   * keeps recording. Supply `(id) => mmkvTransport.getEntriesForSession(id)`.
   * Omit when there's no per-session persistence.
   *
   * @example
   * ```tsx
   * <DebugPanelProvider getSessionLogs={(id) => mmkvTransport.getEntriesForSession(id)} />
   * ```
   */
  getSessionLogs?: (sessionId: string) => readonly LogEntry[];
}

/**
 * Provider distributing panel state to the subtree and (when open) rendering
 * the modal UI as a sibling of `children`.
 *
 * Place near the root of the app, inside any error boundary and below
 * navigation/state providers:
 *
 * @example
 * ```tsx
 * import { DebugPanelProvider, AppErrorBoundary } from 'react-native-observability';
 *
 * export default function App() {
 *   return (
 *     <AppErrorBoundary logger={logger}>
 *       <DebugPanelProvider enabled={__DEV__}>
 *         <Root />
 *       </DebugPanelProvider>
 *     </AppErrorBoundary>
 *   );
 * }
 * ```
 *
 * Inside any descendant, open or close the panel with the hook:
 *
 * ```tsx
 * import { useDebugPanel } from 'react-native-observability';
 * const { openPanel } = useDebugPanel();
 * <Button onPress={() => openPanel('logs')} title="Open Observability" />
 * ```
 */
export function DebugPanelProvider({
  children,
  enabled = true,
  tabs = DEFAULT_TABS,
  initialTab,
  logSource,
  networkSource,
  screenSource,
  openOn = [],
  accelerometer,
  multiTapCount = 5,
  multiTapMaxDelayMs = 300,
  gestureTab,
  mode = 'system',
  density = 'comfortable',
  theme,
  preset,
  fonts,
  iconSet,
  haptics,
  panelComponent: PanelComponent,
  persist,
  branding,
  mockEngine,
  onClearStorage,
  safeAreaInsets,
  getSessionLogs,
}: DebugPanelProviderProps): React.ReactElement {
  // Validate initialTab against the tab set. If invalid, fall back to first.
  const firstTab = tabs[0] ?? 'logs';
  const explicitInitial: DebugPanelTab =
    initialTab !== undefined && tabs.includes(initialTab) ? initialTab : firstTab;

  // Seed the active tab from persisted prefs (if any), falling back to the
  // resolved initial. `initialTab`, when explicitly set, always wins.
  const resolvedInitial = useMemo<DebugPanelTab>(() => {
    if (initialTab !== undefined) return explicitInitial;
    if (persist === null || persist === undefined) return explicitInitial;
    try {
      const raw = persist.getItem('observability.panel.activeTab');
      if (raw !== null) {
        const saved = JSON.parse(raw) as DebugPanelTab;
        if (tabs.includes(saved)) return saved;
      }
    } catch {
      // ignore — fall back to the resolved initial
    }
    return explicitInitial;
  }, [initialTab, explicitInitial, persist, tabs]);

  const persistActiveTab = useCallback(
    (tab: DebugPanelTab) => {
      if (persist === undefined) return;
      try {
        persist.setItem('observability.panel.activeTab', JSON.stringify(tab));
      } catch {
        // best-effort
      }
    },
    [persist]
  );

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTabState] = useState<DebugPanelTab>(resolvedInitial);
  const [selectedSessionId, setSelectedSessionIdState] = useState<string | undefined>(undefined);

  const openPanel = useCallback(
    (tab?: DebugPanelTab) => {
      if (!enabled) return;
      if (tab !== undefined && tabs.includes(tab)) {
        setActiveTabState(tab);
        persistActiveTab(tab);
      }
      setIsOpen(true);
    },
    [enabled, tabs, persistActiveTab]
  );

  const closePanel = useCallback(() => {
    setIsOpen(false);
    // Reset session selection so reopening shows the live session.
    setSelectedSessionIdState(undefined);
  }, []);

  const setActiveTab = useCallback(
    (tab: DebugPanelTab) => {
      if (tabs.includes(tab)) {
        setActiveTabState(tab);
        persistActiveTab(tab);
      }
    },
    [tabs, persistActiveTab]
  );

  const setSelectedSessionId = useCallback((sessionId: string | undefined) => {
    setSelectedSessionIdState(sessionId);
  }, []);

  const resolvedLogSource = logSource ?? null;
  const resolvedNetworkSource = networkSource ?? null;
  // Default the screen source to the library's singleton so the Navigation
  // tab works without consumer wiring. A consumer who wants to disable it
  // entirely can pass an empty stub.
  const resolvedScreenSource: ScreenSource = screenSource ?? getScreenStore();

  // The slice registry must keep stable identity across renders so
  // useSyncExternalStore on the State tab side stays subscribed. useRef
  // satisfies that without re-rendering the provider on slice changes.
  const sliceRegistryRef = useRef<SliceRegistry | null>(null);
  if (sliceRegistryRef.current === null) {
    sliceRegistryRef.current = new SliceRegistry();
  }
  const sliceRegistry = sliceRegistryRef.current;

  const registerStateSlice = useCallback(
    (name: string, selector: () => unknown): (() => void) => {
      return sliceRegistry.register(name, selector);
    },
    [sliceRegistry]
  );

  const value = useMemo<DebugPanelContextValue>(
    () => ({
      isOpen,
      openPanel,
      closePanel,
      activeTab,
      setActiveTab,
      tabs,
      selectedSessionId,
      setSelectedSessionId,
      logSource: resolvedLogSource,
      networkSource: resolvedNetworkSource,
      screenSource: resolvedScreenSource,
      registerStateSlice,
      stateSliceRegistry: sliceRegistry,
      ...(branding !== undefined ? { branding } : {}),
      ...(mockEngine !== undefined ? { mockEngine } : {}),
      ...(onClearStorage !== undefined ? { onClearStorage } : {}),
      ...(safeAreaInsets !== undefined ? { safeAreaInsets } : {}),
      ...(getSessionLogs !== undefined ? { getSessionLogs } : {}),
    }),
    [
      isOpen,
      openPanel,
      closePanel,
      activeTab,
      setActiveTab,
      tabs,
      selectedSessionId,
      setSelectedSessionId,
      resolvedLogSource,
      resolvedNetworkSource,
      resolvedScreenSource,
      registerStateSlice,
      sliceRegistry,
      branding,
      mockEngine,
      onClearStorage,
      safeAreaInsets,
      getSessionLogs,
    ]
  );

  // Gesture wiring — the shake hook runs unconditionally with `enabled`
  // false when the gesture isn't requested, so the hook count stays stable.
  const shakeRequested = enabled && openOn.includes('shake');
  const multiTapRequested = enabled && openOn.includes('multiTap');
  const onGestureOpen = useCallback(() => {
    openPanel(gestureTab);
  }, [openPanel, gestureTab]);

  useShakeDetector(shakeRequested ? accelerometer : undefined, onGestureOpen, {
    enabled: shakeRequested,
  });

  return (
    <DebugPanelContext.Provider value={value}>
      <PanelPrefsProvider value={persist ?? null}>
        <IconSetProvider value={iconSet ?? null}>
          <HapticsProvider value={haptics ?? null}>
            <ThemeProvider
              mode={mode}
              theme={theme}
              density={density}
              {...(preset !== undefined ? { preset } : {})}
              {...(fonts !== undefined ? { fonts } : {})}
            >
              {children}
              {multiTapRequested ? (
                <MultiTapTarget
                  count={multiTapCount}
                  maxDelayMs={multiTapMaxDelayMs}
                  onTrigger={onGestureOpen}
                />
              ) : null}
              {enabled && isOpen ? (
                PanelComponent !== undefined ? (
                  <PanelComponent />
                ) : (
                  <DebugPanel />
                )
              ) : null}
            </ThemeProvider>
          </HapticsProvider>
        </IconSetProvider>
      </PanelPrefsProvider>
    </DebugPanelContext.Provider>
  );
}
