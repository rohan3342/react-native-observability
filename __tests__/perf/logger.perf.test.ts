import { Logger } from '../../src/logger/Logger';
import { MemoryTransport } from '../../src/logger/transports/MemoryTransport';
import { MMKVTransport } from '../../src/storage/MMKVTransport';
import { LogLevel } from '../../src/logger/types';
import type { MMKVLike } from '../../src/storage/createStorage';
import { deepRedact, resolveRedactConfig } from '../../src/logger/redact/deepRedact';

/**
 * Perf regression harness (plan S1/S19). These are NOT absolute SLO proofs —
 * CI hardware varies — but they catch order-of-magnitude regressions. Budgets
 * are deliberately loose (≈100× the target) so they're stable in CI while still
 * failing if something becomes pathologically slow (e.g. an O(n²) reintroduced
 * in the write path or a redaction blowup).
 */

/** High-resolution `now()` in ms — `performance` exists in Node and Hermes. */
const now: () => number = (globalThis as { performance?: { now(): number } }).performance
  ? () => (globalThis as unknown as { performance: { now(): number } }).performance.now()
  : () => Date.now();

/**
 * Median per-op microseconds over `batches` batches of `batchSize` calls each.
 * Batching amortizes timer resolution (`performance.now()` is ms-granular in
 * some runtimes) so a sub-microsecond op is still measurable.
 */
function medianMicros(batches: number, batchSize: number, fn: () => void): number {
  const samples: number[] = [];
  for (let b = 0; b < batches; b++) {
    const start = now();
    for (let i = 0; i < batchSize; i++) fn();
    const end = now();
    samples.push(((end - start) * 1000) / batchSize); // ms total → µs per op
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)]!;
}

class FakeMMKV implements MMKVLike {
  readonly data = new Map<string, string | number | boolean>();
  set(k: string, v: string | number | boolean): void {
    this.data.set(k, v);
  }
  getString(k: string): string | undefined {
    const v = this.data.get(k);
    return typeof v === 'string' ? v : undefined;
  }
  getNumber(k: string): number | undefined {
    const v = this.data.get(k);
    return typeof v === 'number' ? v : undefined;
  }
  getBoolean(k: string): boolean | undefined {
    const v = this.data.get(k);
    return typeof v === 'boolean' ? v : undefined;
  }
  contains(k: string): boolean {
    return this.data.has(k);
  }
  delete(k: string): void {
    this.data.delete(k);
  }
  getAllKeys(): string[] {
    return [...this.data.keys()];
  }
}

describe('perf — logger.info() with memory + console-free transport', () => {
  it('stays well under a generous per-call budget (regression guard)', () => {
    const mem = new MemoryTransport({ maxEntries: 1000 });
    const logger = new Logger({ namespace: 'perf', level: LogLevel.DEBUG, transports: [mem] });

    // warm up
    for (let i = 0; i < 1000; i++) logger.info('warmup', { i });

    const median = medianMicros(200, 100, () => logger.info('hot path', { userId: 'u1', n: 42 }));
    // Target is < 50 µs p95 on Hermes; budget here is a loose CI-stable guard.
    expect(median).toBeLessThan(500);
  });
});

describe('perf — MMKVTransport.write() is in-memory (write-behind)', () => {
  it('buffered write stays under a generous budget regardless of session size', () => {
    const t = new MMKVTransport({ storage: new FakeMMKV(), flushBatchSize: 1_000_000 });
    t.setSessionId('perf');
    const entry = {
      id: 'e',
      timestamp: 0,
      level: LogLevel.WARN,
      namespace: 'perf',
      message: 'persisted',
    };

    // 5k writes WITHOUT flushing — each must be O(1) in-memory.
    const median = medianMicros(200, 100, () => t.write({ ...entry }));
    // Write-behind target is < 1 ms; loose guard catches an O(n) regression.
    expect(median).toBeLessThan(200);
  });
});

describe('perf — deepRedact on a moderately nested object', () => {
  it('redacts a 5-key nested object under a generous budget', () => {
    const cfg = resolveRedactConfig({ keys: ['**.password'] });
    const obj = {
      user: { email: 'a@b.com', password: 'secret', profile: { token: 'eyJabc.def.ghi' } },
      meta: { count: 1, items: ['x@y.com', 'safe'] },
    };
    const median = medianMicros(200, 100, () => deepRedact(obj, cfg));
    // Target < 10 µs p95; loose guard.
    expect(median).toBeLessThan(200);
  });
});
