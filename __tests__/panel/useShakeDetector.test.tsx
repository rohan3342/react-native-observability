jest.mock('react-native', () => ({}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  useShakeDetector,
  type AccelerometerSample,
  type AccelerometerSource,
} from '../../src/panel/gestures/useShakeDetector';

/** Fake accelerometer that exposes a `fire()` method to push samples. */
function makeFakeAccelerometer(): {
  source: AccelerometerSource;
  fire(sample: AccelerometerSample): void;
  removed: { value: boolean };
} {
  let listener: ((sample: AccelerometerSample) => void) | null = null;
  const removed = { value: false };
  const source: AccelerometerSource = {
    addListener: cb => {
      listener = cb;
      return {
        remove: () => {
          removed.value = true;
          listener = null;
        },
      };
    },
  };
  return {
    source,
    fire: (sample: AccelerometerSample) => {
      listener?.(sample);
    },
    removed,
  };
}

function Harness({
  source,
  onShake,
  enabled,
  threshold,
  cooldownMs,
}: {
  source: AccelerometerSource | null | undefined;
  onShake: () => void;
  enabled?: boolean;
  threshold?: number;
  cooldownMs?: number;
}): null {
  useShakeDetector(source, onShake, {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(threshold !== undefined ? { threshold } : {}),
    ...(cooldownMs !== undefined ? { cooldownMs } : {}),
  });
  return null;
}

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

describe('useShakeDetector', () => {
  it('fires onShake when a sample exceeds the threshold', () => {
    const onShake = jest.fn();
    const fake = makeFakeAccelerometer();
    render(<Harness source={fake.source} onShake={onShake} threshold={1.8} />);

    act(() => fake.fire({ x: 2, y: 0, z: 0 }));
    expect(onShake).toHaveBeenCalledTimes(1);
  });

  it('does not fire below the threshold', () => {
    const onShake = jest.fn();
    const fake = makeFakeAccelerometer();
    render(<Harness source={fake.source} onShake={onShake} threshold={1.8} />);

    act(() => fake.fire({ x: 1, y: 0, z: 0 }));
    expect(onShake).not.toHaveBeenCalled();
  });

  it('suppresses subsequent shakes within the cooldown window', () => {
    jest.useFakeTimers();
    const baseNow = Date.now();
    jest.setSystemTime(baseNow);

    const onShake = jest.fn();
    const fake = makeFakeAccelerometer();
    render(<Harness source={fake.source} onShake={onShake} threshold={1.8} cooldownMs={1000} />);

    act(() => fake.fire({ x: 2, y: 0, z: 0 }));
    jest.setSystemTime(baseNow + 200);
    act(() => fake.fire({ x: 2, y: 0, z: 0 }));

    expect(onShake).toHaveBeenCalledTimes(1);

    jest.setSystemTime(baseNow + 1500);
    act(() => fake.fire({ x: 2, y: 0, z: 0 }));
    expect(onShake).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('does not subscribe when enabled is false', () => {
    const onShake = jest.fn();
    const fake = makeFakeAccelerometer();
    render(<Harness source={fake.source} onShake={onShake} enabled={false} threshold={1.8} />);

    act(() => fake.fire({ x: 5, y: 0, z: 0 }));
    expect(onShake).not.toHaveBeenCalled();
  });

  it('does not subscribe when the source is null', () => {
    const onShake = jest.fn();
    // Re-using the same harness with null source should simply not subscribe;
    // the test just confirms no throw.
    expect(() => render(<Harness source={null} onShake={onShake} />)).not.toThrow();
  });

  it('unsubscribes on unmount', () => {
    const onShake = jest.fn();
    const fake = makeFakeAccelerometer();
    const tree = render(<Harness source={fake.source} onShake={onShake} threshold={1.8} />);

    act(() => tree.unmount());
    expect(fake.removed.value).toBe(true);
  });

  it('uses the latest onShake without re-subscribing', () => {
    const onShakeA = jest.fn();
    const onShakeB = jest.fn();
    const fake = makeFakeAccelerometer();
    const tree = render(<Harness source={fake.source} onShake={onShakeA} threshold={1.8} />);

    act(() => fake.fire({ x: 2, y: 0, z: 0 }));
    expect(onShakeA).toHaveBeenCalledTimes(1);

    act(() => {
      tree.update(<Harness source={fake.source} onShake={onShakeB} threshold={1.8} />);
    });

    jest.useFakeTimers();
    jest.setSystemTime(Date.now() + 5000);
    act(() => fake.fire({ x: 2, y: 0, z: 0 }));
    jest.useRealTimers();

    expect(onShakeB).toHaveBeenCalledTimes(1);
    // The original onShakeA should not have been called again
    expect(onShakeA).toHaveBeenCalledTimes(1);
    // And the accelerometer was not unsubscribed in the middle
    expect(fake.removed.value).toBe(false);
  });
});
