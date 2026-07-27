import type {
  IObservabilityAdapter,
  ITransport,
  LogEntry,
  LoggerConfig,
  ObservabilityUser,
} from './types';
import { LogLevel } from './types';
import {
  deepRedact,
  redactString,
  resolveRedactConfig,
  type ResolvedRedact,
} from './redact/deepRedact';
import { SelfLogger } from './internal/SelfLogger';
import {
  incrAdapterCalls,
  incrDropped,
  isKillSwitchActive,
  isPanicTripped,
  setAdapterQueueDepth,
} from './internal/metrics';
import { BoundedQueue } from './queue/BoundedQueue';
import { TokenBucket, sampleByKey } from './sampling/TokenBucket';
import { nextEntryId } from './internal/entryId';

/** Default no-op session-id provider used when none is configured. */
const noSessionId = (): undefined => undefined;
const noScreen = (): undefined => undefined;

/** Default adapter-fan-out queue capacity (plan S7). */
const DEFAULT_QUEUE_CAPACITY = 256;

/** One unit of deferred adapter work. */
interface AdapterTask {
  readonly entry: LogEntry;
  readonly error: Error | undefined;
  readonly message: string;
  readonly level: LogLevel;
}

/**
 * Throttle state shared between a parent logger and its `child()`ren so that
 * creating a child cannot be used to bypass sampling or rate limits (plan S8).
 * Sampling is per-entry/per-namespace; the rate-limit bucket is shared.
 */
interface ThrottleState {
  readonly queue: BoundedQueue<AdapterTask>;
  readonly bucket: TokenBucket | null;
  draining: boolean;
}

/**
 * Return an Error whose `message` and `stack` have been value-pattern redacted,
 * without mutating the caller's Error. When redaction changes nothing (the common
 * case), the original is returned so no clone is allocated. Otherwise a shallow
 * clone is made that preserves the prototype, own enumerable properties, and a
 * scrubbed stack — so transports, MMKV, and adapter `captureException` all see the
 * sanitised error while the caller's object is untouched.
 */
function redactErrorMessage(error: Error, cfg: ResolvedRedact): Error {
  if (cfg.isNoop) return error;
  const safeMessage = redactString(error.message, cfg);
  const safeStack = error.stack !== undefined ? redactString(error.stack, cfg) : undefined;
  if (safeMessage === error.message && safeStack === error.stack) return error;

  const clone = Object.create(Object.getPrototypeOf(error) as object) as Error;
  Object.assign(clone, error); // own enumerable props (name overrides, custom fields)
  clone.message = safeMessage;
  if (safeStack !== undefined) clone.stack = safeStack;
  return clone;
}

/**
 * Core structured logger. Instantiate via `createLogger()`.
 *
 * @example
 * ```ts
 * const logger = createLogger({ namespace: 'app', level: LogLevel.DEBUG, transports: [...] });
 * const authLogger = logger.child('auth');
 * authLogger.error('Login failed', new Error('Invalid token'), { userId: 'u123' });
 * ```
 */
export class Logger {
  private readonly config: Required<Omit<LoggerConfig, 'sampling' | 'rateLimit'>> &
    Pick<LoggerConfig, 'sampling' | 'rateLimit'>;
  /** Redaction settings resolved once at construction for the hot path. */
  private readonly redact: ResolvedRedact;
  /** Sampling/rate-limit/queue state — shared with children (plan S8). */
  private readonly throttle: ThrottleState;

  constructor(config: LoggerConfig, sharedThrottle?: ThrottleState) {
    this.config = {
      adapters: [],
      redact: [],
      sessionIdProvider: noSessionId,
      screenProvider: noScreen,
      ...config,
    };
    this.redact = resolveRedactConfig(this.config.redact);
    this.throttle = sharedThrottle ?? {
      queue: new BoundedQueue<AdapterTask>(DEFAULT_QUEUE_CAPACITY),
      bucket:
        config.rateLimit !== undefined
          ? new TokenBucket(config.rateLimit.perSecond, config.rateLimit.burst, Date.now())
          : null,
      draining: false,
    };
  }

  /** Log at DEBUG level. */
  debug(message: string, context?: Record<string, unknown>): void {
    this.write(LogLevel.DEBUG, message, context);
  }

  /** Log at INFO level. */
  info(message: string, context?: Record<string, unknown>): void {
    this.write(LogLevel.INFO, message, context);
  }

  /** Log at WARN level. */
  warn(message: string, context?: Record<string, unknown>): void {
    this.write(LogLevel.WARN, message, context);
  }

  /**
   * Log at ERROR level. `errorOrContext` can be an `Error` instance or a plain context object.
   *
   * @example
   * ```ts
   * logger.error('Payment failed', new Error('Timeout'), { orderId: 'o123' });
   * logger.error('Payment failed', { orderId: 'o123' });
   * ```
   */
  error(
    message: string,
    errorOrContext?: Error | Record<string, unknown>,
    context?: Record<string, unknown>
  ): void {
    const [err, ctx] =
      errorOrContext instanceof Error ? [errorOrContext, context] : [undefined, errorOrContext];
    this.write(LogLevel.ERROR, message, ctx, err);
  }

  /**
   * Returns a new Logger sharing the same transports/adapters/redact config but with
   * the namespace prefixed: `"app"` + `"auth"` → `"app:auth"`.
   *
   * @example
   * ```ts
   * const authLogger = logger.child('auth'); // namespace: 'app:auth'
   * ```
   */
  child(namespace: string): Logger {
    // Share throttle state so a child cannot bypass sampling/rate limits.
    return new Logger(
      {
        ...this.config,
        namespace: `${this.config.namespace}:${namespace}`,
      },
      this.throttle
    );
  }

  /**
   * Set user identity on all adapters in one call.
   * Pass `{}` on logout to clear identity.
   *
   * Each adapter call is isolated: a throwing adapter neither aborts the loop
   * (so later adapters still receive the identity) nor propagates to the host
   * call site. Matches the isolation guarantee of {@link write}.
   */
  setUser(user: ObservabilityUser): void {
    for (const adapter of this.config.adapters) {
      try {
        adapter.setUser?.(user);
      } catch (adapterError) {
        SelfLogger.adapterFailed(adapter.name, adapterError);
      }
    }
  }

  /**
   * Set an arbitrary context key on all adapters.
   *
   * Isolated per adapter, exactly like {@link setUser} and {@link write}.
   */
  setContext(key: string, value: Record<string, unknown>): void {
    for (const adapter of this.config.adapters) {
      try {
        adapter.setContext?.(key, value);
      } catch (adapterError) {
        SelfLogger.adapterFailed(adapter.name, adapterError);
      }
    }
  }

  /**
   * Flush all adapters that support async flushing (e.g. Sentry before
   * teardown). Pass an {@link AbortSignal} to bound how long callers wait;
   * it is forwarded to each adapter's `flush(signal)`. Never rejects — a
   * failing or slow adapter cannot break teardown (uses `allSettled`).
   */
  async flush(signal?: AbortSignal): Promise<void> {
    await Promise.allSettled(
      this.config.adapters
        .filter(
          (a): a is IObservabilityAdapter & Required<Pick<IObservabilityAdapter, 'flush'>> =>
            typeof a.flush === 'function'
        )
        .map(a => a.flush(signal))
    );
  }

  private write(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    if (level < this.config.level) return;

    // Kill-switch: single boolean read at the top of the hot path (plan S18).
    if (isKillSwitchActive()) {
      incrDropped('killSwitch');
      return;
    }

    let sessionId: string | undefined;
    try {
      sessionId = this.config.sessionIdProvider();
    } catch {
      // Provider must never crash the logger — fall back to undefined
      sessionId = undefined;
    }

    // Explicit per-call screen override. A reserved `screen` key in context wins
    // over the ambient provider: a string reassigns the screen, `null` forces
    // "no screen" (for global/background work that shouldn't be attributed to the
    // mounted screen). The key is stripped from the persisted context so it never
    // appears as payload. When absent, fall back to the ambient provider.
    let screen: string | undefined;
    let cleanContext = context;
    if (context !== undefined && 'screen' in context) {
      const { screen: override, ...rest } = context as Record<string, unknown>;
      screen = typeof override === 'string' ? override : undefined;
      cleanContext = Object.keys(rest).length > 0 ? rest : undefined;
    } else {
      try {
        screen = this.config.screenProvider();
      } catch {
        // Provider must never crash the logger — fall back to undefined
        screen = undefined;
      }
    }

    // Redaction is a security guarantee, not a display feature: scrub PII from
    // the message and the error's message too, not only `context` — otherwise a
    // secret in a log message or a thrown Error (e.g. `auth failed for a@b.com`)
    // reaches transports, MMKV, and remote adapters verbatim. Value patterns
    // (email/JWT/CC/custom) run on these free-text strings; key globs cannot.
    const safeMessage = redactString(message, this.redact);
    const safeError = error !== undefined ? redactErrorMessage(error, this.redact) : undefined;

    const entry: LogEntry = {
      // Monotonic per-boot id — deterministic within a run so sampling
      // (sampleByKey hashes this) is reproducible. See internal/entryId.ts.
      id: nextEntryId(),
      timestamp: Date.now(),
      level,
      namespace: this.config.namespace,
      message: safeMessage,
      ...(cleanContext !== undefined ? { context: deepRedact(cleanContext, this.redact) } : {}),
      ...(safeError !== undefined ? { error: safeError } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(screen !== undefined ? { screen } : {}),
    };

    // Transports run SYNCHRONOUSLY and see EVERY entry — they are the operator's
    // full local picture; sampling/rate-limit never touch them (DR-3).
    for (const transport of this.config.transports) {
      if (level < transport.minLevel) continue;
      try {
        transport.write(entry);
      } catch (writeError) {
        SelfLogger.transportFailed(transport.name, writeError);
      }
    }

    // Adapter fan-out is gated (sampling + rate-limit) and deferred to a
    // microtask via a bounded queue, so a slow adapter never blocks the caller.
    if (this.config.adapters.length === 0) return;
    if (!this.passesSampling(entry)) {
      incrDropped('sampled');
      return;
    }
    if (this.throttle.bucket !== null && !this.throttle.bucket.tryRemove(entry.timestamp)) {
      incrDropped('rateLimited');
      return;
    }

    // Adapters receive the redacted message/error too — captureException /
    // captureMessage ship these off-device, so they must not carry raw PII.
    const accepted = this.throttle.queue.push({
      entry,
      error: safeError,
      message: safeMessage,
      level,
    });
    if (!accepted) {
      incrDropped('queueFull');
      return;
    }
    setAdapterQueueDepth(this.throttle.queue.size);
    this.scheduleDrain();
  }

  /** Resolve the keep-rate for an entry (per-namespace overrides win). */
  private passesSampling(entry: LogEntry): boolean {
    const sampling = this.config.sampling;
    if (sampling === undefined) return true;

    let rate: number | undefined;
    if (sampling.perNamespace !== undefined) {
      let bestLen = -1;
      for (const ns of sampling.perNamespace) {
        if (entry.namespace.startsWith(ns.prefix) && ns.prefix.length > bestLen) {
          const r = ns.rates[entry.level];
          if (r !== undefined) {
            rate = r;
            bestLen = ns.prefix.length;
          }
        }
      }
    }
    if (rate === undefined) rate = sampling.rates?.[entry.level];
    if (rate === undefined) return true;
    return sampleByKey(entry.id, rate);
  }

  /** Schedule a single microtask drain of the shared adapter queue. */
  private scheduleDrain(): void {
    if (this.throttle.draining) return;
    this.throttle.draining = true;
    queueMicrotask(() => this.drain());
  }

  private drain(): void {
    this.throttle.draining = false;
    // Panic pauses the fan-out: leave queued tasks in place (a later
    // clearPanic() + write resumes the drain) and stop touching adapters.
    // Transports already ran synchronously, so local visibility is unaffected.
    if (isPanicTripped()) return;

    const { queue } = this.throttle;
    let task: AdapterTask | undefined;
    while ((task = queue.shift()) !== undefined) {
      setAdapterQueueDepth(queue.size);
      for (const adapter of this.config.adapters) {
        if (task.level < adapter.minLevel) continue;
        incrAdapterCalls();
        try {
          if (task.error !== undefined) {
            adapter.captureException(task.error, task.entry.context);
          } else {
            adapter.captureMessage?.(task.message, task.level, task.entry.context);
          }
        } catch (adapterError) {
          SelfLogger.adapterFailed(adapter.name, adapterError);
        }
      }
    }
  }
}

/** @internal */
export type ResolvedLoggerConfig = Required<LoggerConfig>;

export type { ITransport, IObservabilityAdapter };
