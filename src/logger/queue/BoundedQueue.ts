/**
 * A fixed-capacity FIFO queue with a drop-tail policy (plan S7). Used to bound
 * the adapter fan-out: if adapters can't keep up, the **newest** task is dropped
 * (drop-tail) and a counter is incremented, rather than growing unbounded and
 * exhausting memory.
 *
 * Implemented as a ring buffer for O(1) push/shift with no array churn.
 */
export class BoundedQueue<T> {
  private readonly buffer: Array<T | undefined>;
  private readonly capacity: number;
  private head = 0;
  private tail = 0;
  private count = 0;
  /** Number of items rejected because the queue was full. */
  private droppedCount = 0;

  /**
   * @param capacity - maximum items retained. Must be ≥ 1.
   */
  constructor(capacity: number) {
    this.capacity = Math.max(1, Math.floor(capacity));
    this.buffer = new Array<T | undefined>(this.capacity);
  }

  /** Current number of queued items. */
  get size(): number {
    return this.count;
  }

  /** Total items dropped (drop-tail) since construction. */
  get dropped(): number {
    return this.droppedCount;
  }

  /**
   * Enqueue an item. Returns `true` if accepted, `false` if the queue was full
   * and the item was dropped (drop-tail).
   */
  push(item: T): boolean {
    if (this.count === this.capacity) {
      this.droppedCount++;
      return false;
    }
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.count++;
    return true;
  }

  /** Dequeue the oldest item, or `undefined` when empty. */
  shift(): T | undefined {
    if (this.count === 0) return undefined;
    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined; // release reference for GC
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return item;
  }
}
