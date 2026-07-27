import type { IObservabilityAdapter } from '../logger/types';
import { LogLevel } from '../logger/types';

/**
 * Creates a custom observability adapter — an escape hatch for any backend
 * not covered by the built-in adapters (Datadog, Amplitude, a homegrown
 * logging service, etc.).
 *
 * `minLevel` defaults to `LogLevel.ERROR` if omitted.
 *
 * @example
 * ```ts
 * const datadogAdapter = createCustomAdapter({
 *   name: 'datadog',
 *   captureException: (err, ctx) => DdLogs.error(err.message, ctx),
 *   setUser: user => DdSdkReactNative.setUser({ id: String(user.id ?? '') }),
 * });
 * ```
 */
export function createCustomAdapter(
  impl: Omit<IObservabilityAdapter, 'minLevel'> & { minLevel?: LogLevel }
): IObservabilityAdapter {
  return { minLevel: LogLevel.ERROR, ...impl };
}
