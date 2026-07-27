import type React from 'react';
import type { LoggerConfig } from '../logger/types';

/**
 * Primary tab identifiers for the debug panel.
 * Controls which tabs are visible when the panel is open.
 *
 * `'performance'` is **opt-in** — it is not in the default tab set; list it
 * explicitly in `DebugPanelProvider.tabs` to show it.
 */
export type DebugPanelTab =
  | 'logs'
  | 'network'
  | 'state'
  | 'navigation'
  | 'settings'
  | 'performance';

/**
 * Configuration for the optional MMKV-backed persistence layer.
 * When disabled (default), all data is in-memory only and lost on restart.
 *
 * Requires `react-native-mmkv` as an installed peer dependency when `enabled` is `true`.
 */
export interface StorageConfig {
  /**
   * Whether to persist logs and network entries across app restarts.
   * Default: `false` — opt-in consciously.
   */
  enabled: boolean;
  /** Maximum number of sessions to retain (current + N previous). Default: `2`. */
  maxSessions?: number;
  /**
   * Optional encryption via MMKV's built-in support. The cipher is **AES-CFB**
   * (confidentiality only, no authentication tag) — not AES-GCM. See
   * `createStorage()` and DR-6 in the architecture plan. When enabled, `key`
   * must be provided by the consumer (16–32 bytes). Never hardcode the key —
   * load it from secure storage (Keychain / Keystore / expo-secure-store).
   */
  encryption?: {
    enabled: boolean;
    /** Consumer-supplied encryption key. Must be 16–32 bytes. */
    key: string;
    /**
     * Increment to trigger key rotation on next launch (S11.4).
     * Default: `1`.
     */
    keyVersion?: number;
  };
}

/**
 * Top-level configuration object passed to `ObservabilityConfig.init()`.
 *
 * @example
 * ```ts
 * ObservabilityConfig.init({
 *   app: { name: 'MyApp', version: '1.0.0', buildNumber: 1, buildType: 'development' },
 *   logger: { namespace: 'app', level: LogLevel.DEBUG, transports: [new ConsoleTransport()] },
 * });
 * ```
 */
export interface ObservabilityConfig {
  /** Static app metadata attached to every log entry and crash report. */
  app: {
    name: string;
    version: string;
    buildNumber: number | string;
    /** E.g. `'development'`, `'staging'`, `'production'`. */
    buildType: 'development' | 'staging' | 'production' | string;
    /** All environment names known to the app. */
    environments?: string[];
    /** The currently active environment. */
    currentEnvironment?: string;
  };
  /** Logger configuration forwarded to `createLogger()`. */
  logger: LoggerConfig;
  /**
   * MMKV persistence layer.
   * Omit or set `enabled: false` to disable — only MemoryTransport will be used.
   */
  storage?: StorageConfig;
  /** Debug panel visibility and gesture configuration. */
  debugPanel?: {
    /** Whether the panel is accessible at runtime. */
    enabled: boolean;
    /** Gestures that open the panel. Default: `['shake']`. */
    entryGesture?: Array<'shake' | 'multiTap'>;
    /** Which tabs appear in the panel. Defaults to all tabs. */
    tabs?: DebugPanelTab[];
    /** Number of taps required for the multiTap gesture. Default: `5`. */
    multiTapCount?: number;
    /** Maximum milliseconds between taps for multiTap. Default: `300`. */
    multiTapMaxDelay?: number;
  };
  /** Global error boundary settings applied to `AppErrorBoundary`. */
  errorBoundary?: {
    /** Called on every caught error. Use to forward to an adapter manually. */
    onError?: (error: Error, info: React.ErrorInfo) => void;
    /** Custom fallback UI rendered when a boundary catches. */
    FallbackComponent?: React.ComponentType<{ error: Error; retry: () => void }>;
  };
}
