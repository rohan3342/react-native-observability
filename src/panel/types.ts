import type { LogEntry } from '../logger/types';
import type { MockEngine, NetworkLogEntry } from '../integrations/http';
import type { ScreenLifecycleEvent, ScreenSummary } from '../integrations/screen';
import type { DebugPanelTab } from '../config/types';

/**
 * Re-export the canonical `DebugPanelTab` from the config module so the
 * panel sub-path and `ObservabilityConfig.debugPanel.tabs` share a single
 * source of truth. The order in which a consumer lists tabs (via
 * `DebugPanelProvider.tabs`) controls the tab bar ordering.
 */
export type { DebugPanelTab };

/** Default tab set when none is provided. */
export const DEFAULT_TABS: readonly DebugPanelTab[] = [
  'logs',
  'network',
  'state',
  'navigation',
  'settings',
] as const;

/** Human-readable labels rendered in the tab bar. */
export const TAB_LABELS: Readonly<Record<DebugPanelTab, string>> = {
  logs: 'Logs',
  network: 'Network',
  state: 'State',
  navigation: 'Navigation',
  settings: 'Settings',
  performance: 'Perf',
};

/**
 * Minimal `useSyncExternalStore` source the panel reads logs from.
 * Structurally satisfied by the real `MemoryTransport`.
 */
export interface LogSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly LogEntry[];
  /**
   * Returns the unique set of namespaces currently in the buffer. Used to
   * derive the namespace filter chip row. Optional — when absent, the chips
   * are derived from snapshot entries directly.
   */
  getNamespaces?(): string[];
  /**
   * Empties the buffer. Optional — present on the real `MemoryTransport`; the
   * Settings tab's "Clear logs" action calls it when available.
   */
  clear?(): void;
}

/**
 * Minimal `useSyncExternalStore` source the panel reads network entries
 * from. Structurally satisfied by `HttpObserver.store` (the real
 * `NetworkLogStore`).
 */
export interface NetworkSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly NetworkLogEntry[];
  /**
   * Empties the store. Optional — present on the real `NetworkLogStore`; the
   * Settings tab's "Clear network history" action calls it when available.
   */
  clear?(): void;
}

/**
 * Minimal source the panel reads screen lifecycle events from.
 * Structurally satisfied by the singleton returned by `getScreenStore()`.
 *
 * `getSummaries()` is required (unlike the other sources' richer accessors)
 * because the Navigation tab's primary view is the per-screen aggregate, not
 * the raw event list.
 */
export interface ScreenSource {
  subscribe(listener: () => void): () => void;
  getSnapshot(): readonly ScreenLifecycleEvent[];
  getSummaries(): ScreenSummary[];
  /**
   * Empties the event log. Optional — present on the real `ScreenMountStore`;
   * the Settings tab's "Clear screen history" action calls it when available.
   */
  clear?(): void;
}

/**
 * Branding shown in the panel header. All fields optional — omit any to fall
 * back to the Observability defaults. Lets a consumer rebrand the in-app panel
 * (e.g. "Acme Debug") without replacing the whole UI.
 */
export interface PanelBranding {
  /** Header title. Default: `'Observability'`. */
  readonly title?: string;
  /** Small subtitle under the title (e.g. an environment label). */
  readonly subtitle?: string;
  /**
   * Leading glyph/emoji rendered before the title. Default: `'🩺'`. Pass an
   * empty string to omit. (A full image logo is out of scope — text/emoji keeps
   * the panel dependency-free and avoids asset bundling.)
   */
  readonly logo?: string;
}

/** Public state + actions exposed by {@link useDebugPanel}. */
export interface DebugPanelContextValue {
  /** Whether the modal is currently mounted. */
  readonly isOpen: boolean;
  /** Optional header branding (title/subtitle/logo). */
  readonly branding?: PanelBranding;
  /**
   * Optional network mock engine. When provided, the Network tab gains a
   * "Rules" view to block/mock requests and a "Mock this" action on captured
   * requests. Omit to hide the mock UI entirely.
   */
  readonly mockEngine?: MockEngine;
  /**
   * Open the panel. Optionally set the active tab in the same call.
   *
   * When the supplied tab is not in the panel's `tabs` set the call is
   * accepted, the panel opens, and the active tab falls back to the first
   * configured tab.
   */
  openPanel(tab?: DebugPanelTab): void;
  closePanel(): void;
  /** Active tab. Always one of `tabs`. */
  readonly activeTab: DebugPanelTab;
  setActiveTab(tab: DebugPanelTab): void;
  /** Configured tab set. Stable for the lifetime of the provider. */
  readonly tabs: readonly DebugPanelTab[];
  /**
   * The session id whose data the tabs should render. Defaults to the
   * current session at provider mount. Reset to `undefined` when the
   * panel is closed (so reopening shows the live session).
   */
  readonly selectedSessionId: string | undefined;
  setSelectedSessionId(sessionId: string | undefined): void;
  /**
   * The optional log source read by the Logs tab. When `null` the tab shows
   * an "unconfigured" empty state instead of subscribing to anything.
   */
  readonly logSource: LogSource | null;
  /**
   * The optional network source read by the Network tab. When `null` the tab
   * shows an "unconfigured" empty state.
   */
  readonly networkSource: NetworkSource | null;
  /**
   * Source read by the Navigation tab. Defaults to the singleton
   * `getScreenStore()` populated by `trackScreen()` — consumers rarely need
   * to override this. Passing `null` shows the tab's "unconfigured" state.
   */
  readonly screenSource: ScreenSource | null;
  /**
   * Register a state-slice selector. The State tab renders one row per
   * registered slice, evaluating the selector at render time.
   *
   * Re-registering an existing name replaces the previous selector
   * (predictable hot-reload behaviour).
   *
   * @returns A function that unregisters this slice. Suitable for use as
   *   the return value of a `useEffect`:
   *
   * ```tsx
   * useEffect(() => registerStateSlice('user', () => store.getState().user), []);
   * ```
   */
  registerStateSlice(name: string, selector: () => unknown): () => void;
  /**
   * Internal slice store the State tab subscribes to. The snapshot is the
   * list of registered slice names; values are pulled from `get(name)()` at
   * render time.
   *
   * @internal — exposed so the State tab can read it; consumers do not need
   * to call this directly.
   */
  readonly stateSliceRegistry: {
    subscribe(listener: () => void): () => void;
    getSnapshot(): readonly string[];
    get(name: string): (() => unknown) | undefined;
  };
  /**
   * Optional callback that clears the consumer's **persistent** storage (e.g. the
   * MMKV instance backing `MMKVTransport` / `SessionManager`). The panel cannot
   * reach the app's storage instance itself, so the consumer supplies this. When
   * provided, Settings → Actions gains a "Clear persisted storage" button, and
   * the existing "Clear all" also invokes it. Omit when there is no persistence
   * (e.g. Expo Go).
   */
  readonly onClearStorage?: () => void;
  /**
   * Real device safe-area insets supplied by the consumer (e.g. from
   * `react-native-safe-area-context`). The panel uses these for its top/bottom
   * padding; when absent it falls back to a platform estimate.
   */
  readonly safeAreaInsets?: { top?: number; bottom?: number; left?: number; right?: number };
  /**
   * Reader for a **past** session's persisted logs. When the user picks a prior
   * session in the header selector, the Logs tab calls this with that session's
   * id and shows the returned entries read-only (the live session keeps recording
   * to the live source, untouched). Supply
   * `(id) => mmkvTransport.getEntriesForSession(id)`. Omit when there's no
   * persistence — past-session viewing then shows a "not available" state.
   */
  readonly getSessionLogs?: (sessionId: string) => readonly LogEntry[];
}
