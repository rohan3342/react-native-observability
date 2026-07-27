import type { ITransport, LogEntry } from '../logger/types';
import { LogLevel } from '../logger/types';
import {
  incrStorageQuarantines,
  recordStorageFailure,
  recordStorageWrite,
} from '../logger/internal/metrics';
import type { MMKVLike } from './createStorage';
import { deserialize, serialize } from './schema';
import type { SessionAwareTransport } from './SessionManager';

export interface MMKVTransportOptions {
  /**
   * An initialized MMKV instance. Pass the one returned by
   * `createStorage()` so Observability keys live under a dedicated id and never
   * collide with the host app's storage.
   */
  storage: MMKVLike;
  /** Maximum entries retained per session. Default: `200`. */
  maxEntries?: number;
  /**
   * Maximum total serialized bytes retained per session. When exceeded, the
   * oldest entries are evicted (FIFO) until the budget is met — in addition to
   * the `maxEntries` cap. Protects low-memory devices from a single oversized
   * entry filling storage. Default: `512 * 1024` (512 KB).
   */
  maxBytesPerSession?: number;
  /**
   * Default `LogLevel.WARN`. Filling persistent storage with `DEBUG` noise
   * is rarely useful.
   */
  minLevel?: LogLevel;
  /**
   * Number of buffered writes flushed together. The transport pushes entries to
   * an in-memory ring and flushes on the next idle tick, so `write()` itself is
   * O(1) in-memory. Default: `20`.
   */
  flushBatchSize?: number;
  /**
   * Optional hook to wrap each serialized record before it is persisted — e.g.
   * to apply authenticated encryption (AEAD) on top of MMKV's AES-CFB. Must be
   * synchronous and reversible by {@link MMKVTransportOptions.decryptValue}.
   */
  encryptValue?: (serialized: string) => string;
  /** Inverse of {@link encryptValue}. Required if `encryptValue` is set. */
  decryptValue?: (stored: string) => string;
}

interface SerializedError {
  readonly message: string;
  readonly stack?: string;
  readonly name?: string;
}

interface SerializedLogEntry {
  readonly id: string;
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly namespace: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly error?: SerializedError;
  readonly sessionId?: string;
}

/** One buffered, already-serialized record awaiting flush. */
interface BufferedWrite {
  readonly key: string;
  readonly seq: number;
  readonly value: string;
  readonly bytes: number;
}

const DEFAULT_MAX_ENTRIES = 200;
const DEFAULT_MAX_BYTES = 512 * 1024;
const DEFAULT_FLUSH_BATCH = 20;

/** Schedule a callback for the next idle moment, with a `setTimeout` fallback. */
function scheduleIdle(cb: () => void): void {
  const g = globalThis as unknown as { requestIdleCallback?: (cb: () => void) => void };
  if (typeof g.requestIdleCallback === 'function') {
    g.requestIdleCallback(cb);
  } else {
    setTimeout(cb, 0);
  }
}

/**
 * MMKV-backed persistent log transport.
 *
 * **Write-behind buffer.** `write()` only serializes and pushes to an in-memory
 * ring; a batched flush runs on the next idle tick (`requestIdleCallback`, or a
 * `setTimeout(0)` fallback). This keeps the synchronous `write()` cost off the
 * MMKV I/O path (plan S9/S10).
 *
 * **Key layout.**
 * - `t:l:{sessionId}:{seq}` — one persisted entry per key.
 * - `t:l:{sessionId}:meta:next` — the next `seq` to allocate.
 * - `t:l:{sessionId}:meta:tail` — the lowest `seq` retained (eviction frontier).
 * - `t:l:{sessionId}:{seq}:quarantine:{ts}` — a record whose schema version is
 *   unknown, renamed out of the live range on read instead of being dropped.
 *
 * **Budgets.** Per session, retention is capped by both `maxEntries` and
 * `maxBytesPerSession`; eviction is FIFO by `seq`.
 *
 * **Session correlation.** `setSessionId` is wired by `SessionManager` at launch.
 */
export class MMKVTransport implements ITransport, SessionAwareTransport {
  readonly name = 'mmkv';
  readonly minLevel: LogLevel;

  private readonly storage: MMKVLike;
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly flushBatchSize: number;
  private readonly encryptValue?: (s: string) => string;
  private readonly decryptValue?: (s: string) => string;
  private sessionId = 'default';

  /** In-memory write-behind buffer, drained by {@link flush}. */
  private buffer: BufferedWrite[] = [];
  private flushScheduled = false;
  /** Approximate serialized bytes currently retained for the active session. */
  private sessionBytes = 0;

  constructor(options: MMKVTransportOptions) {
    this.storage = options.storage;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.maxBytes = options.maxBytesPerSession ?? DEFAULT_MAX_BYTES;
    this.minLevel = options.minLevel ?? LogLevel.WARN;
    this.flushBatchSize = options.flushBatchSize ?? DEFAULT_FLUSH_BATCH;
    if (options.encryptValue !== undefined) this.encryptValue = options.encryptValue;
    if (options.decryptValue !== undefined) this.decryptValue = options.decryptValue;
  }

  /** Switch the session under which subsequent writes are stored. */
  setSessionId(sessionId: string): void {
    // Drain anything buffered for the old session before switching keys.
    this.flush();
    this.sessionId = sessionId;
    this.sessionBytes = 0;
  }

  write(entry: LogEntry): void {
    try {
      const seq = this.allocateSeq();
      const key = `t:l:${this.sessionId}:${seq}`;
      const raw = serialize(this.serializeEntry(entry));
      const value = this.encryptValue !== undefined ? this.encryptValue(raw) : raw;
      this.buffer.push({ key, seq, value, bytes: value.length });
      if (this.buffer.length >= this.flushBatchSize) {
        this.flush();
      } else {
        this.scheduleFlush();
      }
    } catch {
      // Transports must never throw. A failed enqueue becomes a silent drop.
    }
  }

  /**
   * Persist all buffered writes immediately. Called on idle, on batch-full, on
   * session switch, and exposed for explicit teardown / tests.
   */
  flush(): void {
    if (this.buffer.length === 0) {
      this.flushScheduled = false;
      return;
    }
    const pending = this.buffer;
    this.buffer = [];
    this.flushScheduled = false;
    try {
      let latestSeq = -1;
      for (const w of pending) {
        this.storage.set(w.key, w.value);
        this.sessionBytes += w.bytes;
        recordStorageWrite(w.bytes);
        if (w.seq > latestSeq) latestSeq = w.seq;
      }
      if (latestSeq >= 0) this.evictOldEntries(latestSeq);
    } catch {
      // A failed persist becomes a silent drop — never throw from a transport.
      // Repeated failures trip panic mode (plan S18).
      recordStorageFailure();
    }
  }

  /**
   * Return the persisted entries for a session in chronological order.
   * Falls back to the active session id when none is supplied.
   *
   * Quarantines (renames out of the live range) any entry whose envelope can't
   * be read at an unknown schema version, rather than dropping it silently — a
   * single bad record neither poisons the timeline nor is lost for forensics.
   */
  getEntriesForSession(sessionId?: string): LogEntry[] {
    this.flush();
    try {
      const sid = sessionId ?? this.sessionId;
      const head = this.readMeta(`t:l:${sid}:meta:tail`);
      const next = this.readMeta(`t:l:${sid}:meta:next`);
      if (next === null) return [];

      const start = head ?? 0;
      const entries: LogEntry[] = [];
      for (let i = start; i < next; i++) {
        const key = `t:l:${sid}:${i}`;
        const stored = this.storage.getString(key);
        if (stored === undefined) continue;
        const raw = this.decryptValue !== undefined ? this.safeDecrypt(stored) : stored;
        if (raw === null) continue;
        const result = deserialize<SerializedLogEntry>(raw);
        if (result.ok) {
          entries.push(this.deserializeEntry(result.payload));
        } else if (result.reason === 'unknown-version') {
          this.quarantine(sid, i, key);
        }
        // parse-error / shape-error: leave in place, skip (could be mid-write).
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** Delete every persisted entry for a session. Used on eviction. */
  clearSession(sessionId?: string): void {
    try {
      const sid = sessionId ?? this.sessionId;
      const prefix = `t:l:${sid}:`;
      for (const k of this.storage.getAllKeys()) {
        if (k.startsWith(prefix)) this.storage.delete(k);
      }
      if (sessionId === undefined || sessionId === this.sessionId) this.sessionBytes = 0;
    } catch {
      // silent
    }
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    scheduleIdle(() => this.flush());
  }

  private allocateSeq(): number {
    const key = `t:l:${this.sessionId}:meta:next`;
    const next = this.readMeta(key) ?? 0;
    this.storage.set(key, next + 1);
    return next;
  }

  private evictOldEntries(latestSeq: number): void {
    const tailKey = `t:l:${this.sessionId}:meta:tail`;
    const currentTail = this.readMeta(tailKey) ?? 0;

    // Count-based frontier.
    const countOvershoot = latestSeq + 1 - this.maxEntries;
    let newTail = Math.max(currentTail, countOvershoot > 0 ? countOvershoot : currentTail);

    // Byte-budget frontier: evict oldest until under budget. We approximate by
    // re-reading sizes lazily only when over budget (rare on the hot path).
    if (this.sessionBytes > this.maxBytes) {
      for (let i = newTail; i <= latestSeq && this.sessionBytes > this.maxBytes; i++) {
        const v = this.storage.getString(`t:l:${this.sessionId}:${i}`);
        if (v !== undefined) this.sessionBytes -= v.length;
        newTail = i + 1;
      }
    }

    for (let i = currentTail; i < newTail; i++) {
      this.storage.delete(`t:l:${this.sessionId}:${i}`);
    }
    if (newTail !== currentTail) this.storage.set(tailKey, newTail);
  }

  /** Rename an unreadable record out of the live `[tail, next)` range. */
  private quarantine(sessionId: string, seq: number, key: string): void {
    try {
      const stored = this.storage.getString(key);
      if (stored === undefined) return;
      this.storage.set(`t:l:${sessionId}:${seq}:quarantine`, stored);
      this.storage.delete(key);
      incrStorageQuarantines();
    } catch {
      // best-effort; never throw on read
    }
  }

  private safeDecrypt(stored: string): string | null {
    try {
      return this.decryptValue !== undefined ? this.decryptValue(stored) : stored;
    } catch {
      return null;
    }
  }

  private readMeta(key: string): number | null {
    const v = this.storage.getNumber(key);
    return typeof v === 'number' ? v : null;
  }

  private serializeEntry(entry: LogEntry): SerializedLogEntry {
    const out: { -readonly [K in keyof SerializedLogEntry]: SerializedLogEntry[K] } = {
      id: entry.id,
      timestamp: entry.timestamp,
      level: entry.level,
      namespace: entry.namespace,
      message: entry.message,
    };
    if (entry.context !== undefined) out.context = entry.context;
    if (entry.sessionId !== undefined) out.sessionId = entry.sessionId;
    if (entry.error !== undefined) {
      const err: { -readonly [K in keyof SerializedError]: SerializedError[K] } = {
        message: entry.error.message,
      };
      if (entry.error.stack !== undefined) err.stack = entry.error.stack;
      if (entry.error.name !== undefined) err.name = entry.error.name;
      out.error = err;
    }
    return out;
  }

  private deserializeEntry(raw: SerializedLogEntry): LogEntry {
    const out: { -readonly [K in keyof LogEntry]: LogEntry[K] } = {
      id: raw.id,
      timestamp: raw.timestamp,
      level: raw.level,
      namespace: raw.namespace,
      message: raw.message,
    };
    if (raw.context !== undefined) out.context = raw.context;
    if (raw.sessionId !== undefined) out.sessionId = raw.sessionId;
    if (raw.error !== undefined) {
      const restored = new Error(raw.error.message);
      if (raw.error.stack !== undefined) restored.stack = raw.error.stack;
      if (raw.error.name !== undefined) restored.name = raw.error.name;
      out.error = restored;
    }
    return out;
  }
}
