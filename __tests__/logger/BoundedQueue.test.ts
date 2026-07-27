import { BoundedQueue } from '../../src/logger/queue/BoundedQueue';

describe('BoundedQueue', () => {
  it('pushes and shifts in FIFO order', () => {
    const q = new BoundedQueue<number>(4);
    q.push(1);
    q.push(2);
    q.push(3);
    expect(q.size).toBe(3);
    expect(q.shift()).toBe(1);
    expect(q.shift()).toBe(2);
    expect(q.shift()).toBe(3);
    expect(q.shift()).toBeUndefined();
    expect(q.size).toBe(0);
  });

  it('drops the newest item (drop-tail) when full and counts drops', () => {
    const q = new BoundedQueue<number>(2);
    expect(q.push(1)).toBe(true);
    expect(q.push(2)).toBe(true);
    expect(q.push(3)).toBe(false); // full → dropped
    expect(q.dropped).toBe(1);
    expect(q.size).toBe(2);
    // The two oldest survive.
    expect(q.shift()).toBe(1);
    expect(q.shift()).toBe(2);
  });

  it('wraps around the ring correctly across many push/shift cycles', () => {
    const q = new BoundedQueue<number>(3);
    for (let i = 0; i < 10; i++) {
      q.push(i);
      expect(q.shift()).toBe(i);
    }
    expect(q.size).toBe(0);
  });

  it('clamps capacity to at least 1', () => {
    const q = new BoundedQueue<number>(0);
    expect(q.push(1)).toBe(true);
    expect(q.push(2)).toBe(false);
  });
});
