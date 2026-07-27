/**
 * In-memory feature flag manager for react-native-observability.
 *
 * Flags are seeded once via `init()` (typically from a remote config payload) and
 * can be overridden at runtime via `override()` — useful for the debug panel's flags
 * tab and for per-test configuration. All state is in-memory; MMKV persistence for
 * overrides is added in Phase 6.
 *
 * `isEnabled()` defaults to `false` for any unknown key so callers never crash on a
 * missing flag — they simply get the disabled/conservative code path.
 *
 * @example
 * ```ts
 * // Bootstrap (after fetching remote config):
 * FeatureFlagManager.init({ new_checkout_ui: true, dark_mode: false });
 *
 * // At call site:
 * if (FeatureFlagManager.isEnabled('new_checkout_ui')) { ... }
 *
 * // Dev panel or test:
 * FeatureFlagManager.override('new_checkout_ui', false);
 * ```
 */
export class FeatureFlagManager {
  private static flags: Record<string, boolean> = {};
  private static overrides: Record<string, boolean> = {};

  /**
   * Seeds the flag store with values from a remote config payload.
   * Replaces any previously seeded flags. Does not clear existing overrides.
   *
   * @param flags - Key/value map of flag names to their enabled states.
   */
  static init(flags: Record<string, boolean>): void {
    FeatureFlagManager.flags = { ...flags };
  }

  /**
   * Returns whether the given feature flag is enabled.
   * Runtime overrides take precedence over seeded values.
   * Returns `false` for any key that was never seeded or overridden.
   *
   * @param key - The feature flag key.
   */
  static isEnabled(key: string): boolean {
    if (Object.prototype.hasOwnProperty.call(FeatureFlagManager.overrides, key)) {
      return FeatureFlagManager.overrides[key] as boolean;
    }
    if (Object.prototype.hasOwnProperty.call(FeatureFlagManager.flags, key)) {
      return FeatureFlagManager.flags[key] as boolean;
    }
    return false;
  }

  /**
   * Applies a runtime override that takes precedence over the seeded value.
   * Intended for the debug panel flags tab and test setup.
   *
   * @param key - The feature flag key to override.
   * @param value - The override value.
   */
  static override(key: string, value: boolean): void {
    FeatureFlagManager.overrides[key] = value;
  }

  /**
   * Returns whether the given key has a runtime override applied.
   * Used by the debug panel's flags view to surface a "modified" indicator.
   */
  static hasOverride(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(FeatureFlagManager.overrides, key);
  }

  /**
   * Clears a single override, reverting the flag to its seeded value.
   * No-op when no override is set.
   */
  static clearOverride(key: string): void {
    delete FeatureFlagManager.overrides[key];
  }

  /**
   * Returns every flag key currently known — the union of seeded and
   * overridden keys. The debug panel's Flags view uses this to enumerate
   * what to render, since `isEnabled` itself reveals nothing.
   *
   * Sorted alphabetically for stable UI ordering.
   */
  static getKnownFlags(): string[] {
    const set = new Set<string>([
      ...Object.keys(FeatureFlagManager.flags),
      ...Object.keys(FeatureFlagManager.overrides),
    ]);
    return [...set].sort();
  }

  /**
   * Clears all seeded flags and runtime overrides.
   *
   * **For test teardown only.** Do not call in production code.
   */
  static reset(): void {
    FeatureFlagManager.flags = {};
    FeatureFlagManager.overrides = {};
  }
}
