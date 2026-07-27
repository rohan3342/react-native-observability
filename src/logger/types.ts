/**
 * Numeric severity levels. Numeric values enable `level >= minLevel` comparisons.
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  /** Disables all output — useful in tests. */
  SILENT = 4,
}

/** A single immutable structured log entry produced by the Logger. */
export interface LogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly level: LogLevel;
  /** Hierarchical namespace, e.g. `"app:auth:otp"`. */
  readonly namespace: string;
  readonly message: string;
  /** Structured context. Redaction has already been applied before this is set. */
  readonly context?: Readonly<Record<string, unknown>>;
  readonly error?: Error;
  /**
   * Session identifier resolved by the Logger via {@link LoggerConfig.sessionIdProvider}.
   * Undefined when no provider is configured (typical pre-SessionManager).
   */
  readonly sessionId?: string;
  /**
   * Name of the screen active when this entry was emitted, resolved by the Logger
   * via {@link LoggerConfig.screenProvider}. Undefined when no provider is wired
   * or no screen was mounted yet. Powers the panel's per-screen log filter.
   */
  readonly screen?: string;
}

/** A local write destination for log entries (console, memory, MMKV, etc.). */
export interface ITransport {
  readonly name: string;
  readonly minLevel: LogLevel;
  write(entry: LogEntry): void;
}

/** A remote observability backend (Sentry, Crashlytics, PostHog, etc.). */
export interface IObservabilityAdapter {
  readonly name: string;
  readonly minLevel: LogLevel;
  captureException(error: Error, context?: Record<string, unknown>): void;
  captureMessage?(message: string, level: LogLevel, context?: Record<string, unknown>): void;
  setUser?(user: ObservabilityUser): void;
  setContext?(key: string, value: Record<string, unknown>): void;
  /**
   * Flush any buffered events. Receives an optional {@link AbortSignal} so the
   * caller can bound how long it waits (e.g. before app teardown). Adapters
   * SHOULD resolve promptly when the signal aborts and MUST never reject the
   * caller's flush — a flush failure is swallowed, not thrown.
   */
  flush?(signal?: AbortSignal): Promise<void>;
}

/** User identity shape passed to `logger.setUser()` and forwarded to all adapters. */
export interface ObservabilityUser {
  id?: string | number;
  email?: string;
  [key: string]: unknown;
}

/**
 * Fine-grained redaction configuration.
 * Use a `string[]` shorthand on `LoggerConfig.redact` when only key-scrubbing is needed.
 *
 * Redaction is **deep** (recurses nested objects/arrays up to {@link maxDepth})
 * and value-pattern redactors are **ON by default** — see {@link valuePatterns}.
 */
export interface RedactConfig {
  /**
   * Keys to redact, as dot/glob paths. `*` matches one path segment, `**` any
   * run. Examples: `'user.email'`, `'*.password'`, `'headers.**'`. Optional —
   * value-pattern redactors below catch common PII even with no keys listed.
   */
  keys?: string[];
  /**
   * Value-side redactors applied to every string in the context tree.
   * **All three are ON by default.** Pass `false` to disable one, e.g.
   * `valuePatterns: { email: false }`. `custom` adds extra regexes.
   */
  valuePatterns?: {
    /** Redact email addresses. Default: `true`. */
    email?: boolean;
    /** Redact JSON Web Tokens. Default: `true`. */
    jwt?: boolean;
    /** Redact Luhn-valid 13–19 digit card numbers. Default: `true`. */
    creditCard?: boolean;
    /** Extra patterns to redact. Default: none. */
    custom?: RegExp[];
  };
  /** Defaults to `'[REDACTED]'`. */
  replacement?: string;
  /** `'replace'` (default): swap value. `'omit'`: remove key entirely. */
  mode?: 'replace' | 'omit';
  /** Max recursion depth for nested redaction. Default: `5`. */
  maxDepth?: number;
}

/**
 * Head-based sampling applied at the **adapter** boundary (plan S7/DR-3). Local
 * transports always see every entry; only remote adapter fan-out is sampled, so
 * the on-device panel never hides drops.
 */
export interface SamplingConfig {
  /** Per-level keep rate, 0..1 (1 = keep all). Default: 1 at every level. */
  rates?: Partial<Record<LogLevel, number>>;
  /** Per-namespace-prefix overrides, applied to the longest matching prefix. */
  perNamespace?: Array<{ prefix: string; rates: Partial<Record<LogLevel, number>> }>;
}

/**
 * Token-bucket rate limiting applied at the **adapter** boundary (plan S7).
 * Overage entries still reach local transports; only adapters are throttled.
 */
export interface RateLimitConfig {
  /** Tokens refilled per second. */
  perSecond: number;
  /** Bucket capacity (max burst). */
  burst: number;
}

/** Configuration passed to `createLogger()`. */
export interface LoggerConfig {
  namespace: string;
  level: LogLevel;
  transports: ITransport[];
  adapters?: IObservabilityAdapter[];
  /**
   * Keys to redact from context before any transport or adapter sees the entry.
   * Accepts a `string[]` shorthand or a full `RedactConfig` object.
   */
  redact?: string[] | RedactConfig;
  /**
   * Optional function invoked once per `write()` to stamp `entry.sessionId`.
   * Typically registered by `SessionManager`. When omitted, entries are
   * written without a `sessionId` field.
   *
   * The provider MUST be cheap (synchronous, no I/O). It is called inside the
   * Logger's hot path.
   */
  sessionIdProvider?: () => string | undefined;
  /**
   * Optional function invoked once per `write()` to stamp `entry.screen` with the
   * currently-active screen. Wire it with `createScreenProvider()` (from
   * `react-native-observability`) to tie logs to navigation. When omitted, entries
   * are written without a `screen` field.
   *
   * The provider MUST be cheap (synchronous, no I/O). It is called inside the
   * Logger's hot path — `createScreenProvider()` is a single store read.
   *
   * **Per-call override.** A reserved `screen` key in a log's `context` overrides
   * this provider: a string reassigns the screen, `null` forces "no screen" (for
   * global/background work — e.g. a token refresh — that should not be attributed
   * to whatever screen is mounted). The key is stripped from the persisted
   * context. Example: `logger.info('refreshed', { screen: null })`.
   */
  screenProvider?: () => string | undefined;
  /**
   * Head-based sampling for the adapter fan-out (plan S7). Omit to keep all.
   * Local transports are never sampled.
   */
  sampling?: SamplingConfig;
  /**
   * Token-bucket rate limiting for the adapter fan-out (plan S7). Omit for no
   * limit. Local transports are never rate-limited.
   */
  rateLimit?: RateLimitConfig;
}
