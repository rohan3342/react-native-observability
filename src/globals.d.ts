/**
 * Global ambient declarations.
 *
 * `__DEV__` and the CJS `require` are provided by `@types/react-native` when
 * any source file transitively imports `'react-native'`. They are also
 * declared here so that source files (e.g. `loadOptionalPeer.ts`,
 * `Logger.ts`) which do NOT import from RN can still reference them.
 *
 * The two-source declaration is structurally identical to RN's; TypeScript
 * merges them with `skipLibCheck: true` enabled.
 */
declare const __DEV__: boolean;
declare function require(module: string): unknown;

/**
 * Package version, injected at build time by tsup's `define` from
 * `package.json`. Falls back to `'0.0.0-dev'` in the test/dev runtime where the
 * define isn't applied (guard usage with `typeof`).
 */
declare const __OBSERVABILITY_VERSION__: string;

/**
 * Global microtask scheduler — available in all Hermes, V8, and modern Node
 * runtimes. Not in the ES2020 lib; declared here to avoid a hard DOM-lib dep.
 */
declare function queueMicrotask(callback: () => void): void;
