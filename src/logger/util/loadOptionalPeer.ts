/**
 * Loads an optional peer dependency at runtime via dynamic `require()`.
 *
 * Returns the resolved module on success, or `null` if the peer is not
 * installed. On miss, emits a single `console.warn` so consumers can see why
 * an adapter or transport silently disabled itself.
 *
 * **Why this exists:** Static `import` of an optional peer evaluates at module
 * parse time and crashes the host app when the peer is absent. Wrapping
 * `require()` per-adapter inline works but spreads identical try/catch
 * boilerplate across the codebase. This helper centralises the pattern so the
 * fail-quiet semantics, warning message, and __DEV__ gating live in one place.
 *
 * **Where to call:** ONLY inside a constructor or function body. Calling this
 * at module top level recreates the v1 anti-pattern (audit findings I6, I7) —
 * even though the helper catches the error, importing the module before the
 * helper resolves can still crash on some bundlers. The ESLint
 * `no-restricted-syntax` rule forbids it.
 *
 * @param name - The package name to resolve, exactly as a consumer would write
 *   in `require()` — e.g. `'@sentry/react-native'`.
 * @returns The resolved module, or `null` when the peer is unavailable.
 *
 * @example
 * ```ts
 * class SentryAdapter {
 *   private sentry: SentrySDK | null;
 *   constructor() {
 *     this.sentry = loadOptionalPeer<SentrySDK>('@sentry/react-native');
 *   }
 * }
 * ```
 */
export function loadOptionalPeer<T>(name: string): T | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name) as T;
  } catch {
    // Surface a warning in dev so the developer knows why the adapter is inert.
    // Silent in production so production logs aren't polluted by intentional opt-out.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        `[observability] Optional peer "${name}" is not installed. The feature using it is disabled.`
      );
    }
    return null;
  }
}
