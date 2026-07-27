import type { ObservabilityConfig as ObservabilityConfigType } from './types';

/**
 * Global configuration singleton for react-native-observability.
 *
 * Call `ObservabilityConfig.init()` once during app bootstrap (before any other
 * Observability API). All subsequent calls to `ObservabilityConfig.get()` return the
 * same frozen config object. Calling `get()` before `init()` throws to prevent
 * silent misconfiguration.
 *
 * @example
 * ```ts
 * // App.tsx (top of file, before rendering)
 * ObservabilityConfig.init({
 *   app: { name: 'MyApp', version: '1.0.0', buildNumber: 1, buildType: 'development' },
 *   logger: { namespace: 'app', level: LogLevel.DEBUG, transports: [new ConsoleTransport()] },
 * });
 * ```
 */
export class ObservabilityConfig {
  private static instance: Readonly<ObservabilityConfigType> | null = null;

  /**
   * Initializes the configuration singleton.
   * Must be called exactly once before any other Observability API.
   *
   * @throws {Error} If `init()` has already been called in this session.
   */
  static init(config: ObservabilityConfigType): void {
    if (ObservabilityConfig.instance !== null) {
      throw new Error(
        '[observability] ObservabilityConfig.init() has already been called. ' +
          'Call ObservabilityConfig.reset() first if you need to re-initialize (tests only).'
      );
    }
    ObservabilityConfig.instance = Object.freeze({ ...config });
  }

  /**
   * Returns the configuration set by `init()`.
   *
   * @throws {Error} If `init()` has not been called yet.
   */
  static get(): Readonly<ObservabilityConfigType> {
    if (ObservabilityConfig.instance === null) {
      throw new Error(
        '[observability] ObservabilityConfig.get() called before ObservabilityConfig.init(). ' +
          'Call ObservabilityConfig.init() during app bootstrap.'
      );
    }
    return ObservabilityConfig.instance;
  }

  /**
   * Resets the singleton to its uninitialized state.
   *
   * **For test teardown only.** Do not call in production code.
   */
  static reset(): void {
    ObservabilityConfig.instance = null;
  }
}
