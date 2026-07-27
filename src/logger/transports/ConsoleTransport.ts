import type { ITransport, LogEntry } from '../types';
import { LogLevel } from '../types';
import { runAsConsoleTransport } from '../internal/consoleReentry';

export interface ConsoleTransportOptions {
  minLevel?: LogLevel;
  /**
   * Allow console output in production. Default: `false`.
   * Only enable for preprod/staging — never for a public release.
   */
  logInProduction?: boolean;
}

const LEVEL_LABELS: Record<number, string> = {
  [LogLevel.DEBUG]: 'DEBUG',
  [LogLevel.INFO]: 'INFO ',
  [LogLevel.WARN]: 'WARN ',
  [LogLevel.ERROR]: 'ERROR',
};

/**
 * Plain-text console transport. Silent in production by default.
 *
 * Routes to `console.error`, `console.warn`, or `console.log` by level so React
 * Native's LogBox and the Hermes inspector apply their native colouring. No
 * ANSI escape codes are emitted — they render as literal `\x1b[33m` garbage on
 * Android and inside LogBox.
 *
 * @example
 * ```ts
 * const logger = createLogger({
 *   namespace: 'app',
 *   level: LogLevel.DEBUG,
 *   transports: [new ConsoleTransport()],
 * });
 * ```
 */
export class ConsoleTransport implements ITransport {
  readonly name = 'console';
  readonly minLevel: LogLevel;
  private readonly enabled: boolean;

  constructor(options: ConsoleTransportOptions = {}) {
    this.minLevel = options.minLevel ?? LogLevel.DEBUG;
    const logInProduction = options.logInProduction ?? false;
    // Resolve the dev-mode decision once at construction so the hot path
    // becomes a single boolean read.
    const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : false;
    this.enabled = isDev || logInProduction;
  }

  write(entry: LogEntry): void {
    if (!this.enabled) return;

    const label = LEVEL_LABELS[entry.level] ?? String(entry.level);
    const prefix = `[${label}] [${entry.namespace}]`;

    const fn =
      entry.level >= LogLevel.ERROR
        ? console.error
        : entry.level >= LogLevel.WARN
          ? console.warn
          : console.log;

    // Mark this as transport-originated console output so an installed console
    // proxy passes it straight to the real console instead of re-forwarding it
    // back into the logger (which would double-record every direct logger.* call).
    runAsConsoleTransport(() => {
      if (entry.error !== undefined && entry.context !== undefined) {
        fn(prefix, entry.message, entry.context, entry.error);
      } else if (entry.error !== undefined) {
        fn(prefix, entry.message, entry.error);
      } else if (entry.context !== undefined) {
        fn(prefix, entry.message, entry.context);
      } else {
        fn(prefix, entry.message);
      }
    });
  }
}
