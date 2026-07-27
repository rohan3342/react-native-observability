/**
 * Configuration for the optional MMKV-backed persistence layer.
 * When persistence is disabled (default) all data lives in `MemoryTransport`
 * and is lost on app restart.
 */
export interface CreateStorageOptions {
  /**
   * MMKV instance id. Use a dedicated id so Observability keys never conflict
   * with the host app's MMKV data. Default: `'observability-storage'`.
   */
  id?: string;
  /**
   * Maximum number of sessions retained (current + N previous).
   * Older sessions and their log/network data are evicted on each launch.
   * Default: `3`.
   */
  maxSessions?: number;
  /**
   * Optional AES-CFB encryption (not AES-GCM — MMKV's underlying primitive
   * is AES-CFB and provides confidentiality but **not** integrity / auth).
   * When enabled, `key` must be supplied by the consumer.
   *
   * Source the key from `react-native-keychain`, `expo-secure-store`, or an
   * equivalent secure-storage primitive. Never hard-code, and never derive
   * from publicly-known values such as the bundle id.
   */
  encryption?: {
    enabled: boolean;
    /** Consumer-supplied key. Minimum 16 characters; longer is stronger. */
    key: string;
  };
}

/**
 * Session metadata persisted under the `t:sessions` MMKV key.
 *
 * `endTime` is written when the app leaves the foreground (`'background'` or
 * `'inactive'`) and cleared again if it returns to `'active'`. If the app
 * crashes while foregrounded, `endTime` will be `undefined` on the next launch
 * — that is the crash-detection signal used by {@link initSessionManager}.
 */
export interface SessionMeta {
  readonly sessionId: string;
  readonly startTime: number;
  readonly appVersion: string;
  readonly buildNumber: string | number;
  endTime?: number;
  /** Set to `true` on next launch if `endTime` is absent. */
  crashed?: boolean;
}
