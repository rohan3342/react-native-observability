import type { ITransport, LogEntry } from '../../logger/types';
import { LogLevel } from '../../logger/types';
import { getBreadcrumbStore } from './BreadcrumbStore';
import type { BreadcrumbLevel, BreadcrumbStore } from './BreadcrumbStore';

/** Options for {@link BreadcrumbTransport}. */
export interface BreadcrumbTransportOptions {
  /** Minimum level to record as a breadcrumb. Default {@link LogLevel.DEBUG}. */
  readonly minLevel?: LogLevel;
  /** Store to record into. Defaults to the shared {@link getBreadcrumbStore}. */
  readonly store?: BreadcrumbStore;
}

function toBreadcrumbLevel(level: LogLevel): BreadcrumbLevel {
  switch (level) {
    case LogLevel.WARN:
      return 'warning';
    case LogLevel.ERROR:
      return 'error';
    case LogLevel.DEBUG:
      return 'debug';
    default:
      return 'info';
  }
}

/**
 * A {@link ITransport} that records every log entry into the breadcrumb timeline
 * (T5-6). Add it to your logger's `transports` alongside the others — it's the
 * always-on capture path for log breadcrumbs (which includes navigation, since
 * `trackScreen` logs `screen:mount`/`screen:unmount`).
 *
 * @example
 * ```ts
 * const logger = createLogger({
 *   namespace: 'app',
 *   level: LogLevel.DEBUG,
 *   transports: [new ConsoleTransport(), memoryTransport, new BreadcrumbTransport()],
 * });
 * ```
 */
export class BreadcrumbTransport implements ITransport {
  readonly name = 'breadcrumb';
  readonly minLevel: LogLevel;
  private readonly store: BreadcrumbStore;

  constructor(options: BreadcrumbTransportOptions = {}) {
    this.minLevel = options.minLevel ?? LogLevel.DEBUG;
    this.store = options.store ?? getBreadcrumbStore();
  }

  write(entry: LogEntry): void {
    // A `screen:` log (from trackScreen) is a navigation breadcrumb; everything
    // else is a log breadcrumb.
    const isNav = entry.message === 'screen:mount' || entry.message === 'screen:unmount';
    this.store.record({
      timestamp: entry.timestamp,
      kind: isNav ? 'navigation' : 'log',
      level: toBreadcrumbLevel(entry.level),
      message: entry.message,
      category: entry.namespace,
      ...(entry.context !== undefined ? { data: entry.context } : {}),
    });
  }
}
