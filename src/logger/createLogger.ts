import { Logger } from './Logger';
import type { LoggerConfig } from './types';

let defaultInstance: Logger | null = null;

/**
 * Creates a new `Logger` instance. The primary way to instantiate a logger.
 *
 * @example
 * ```ts
 * export const logger = createLogger({
 *   namespace: 'app',
 *   level: LogLevel.DEBUG,
 *   transports: [new ConsoleTransport(), new MemoryTransport()],
 *   redact: { keys: ['password', 'token'], mode: 'omit' },
 * });
 * ```
 */
export function createLogger(config: LoggerConfig): Logger {
  return new Logger(config);
}

/**
 * Registers a `Logger` as the process-wide default.
 * Call once during app bootstrap before any `getLogger()` calls.
 */
export function setDefaultLogger(logger: Logger): void {
  defaultInstance = logger;
}

/**
 * Returns the process-wide default logger.
 * Throws if `setDefaultLogger()` has not been called — no silent misconfiguration.
 */
export function getLogger(): Logger {
  if (defaultInstance === null) {
    throw new Error(
      '[observability] getLogger() called before setDefaultLogger(). ' +
        'Call setDefaultLogger(createLogger({ ... })) during app bootstrap.'
    );
  }
  return defaultInstance;
}

/** @internal — test teardown only */
export function _resetDefaultLogger(): void {
  defaultInstance = null;
}
