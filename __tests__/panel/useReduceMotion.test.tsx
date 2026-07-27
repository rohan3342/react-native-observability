let reduceMotionValue = false;
let changeListener: ((v: boolean) => void) | null = null;
let hasApi = true;

jest.mock('react-native', () => ({
  get AccessibilityInfo() {
    if (!hasApi) return undefined;
    return {
      isReduceMotionEnabled: () => Promise.resolve(reduceMotionValue),
      addEventListener: (_type: string, cb: (v: boolean) => void) => {
        changeListener = cb;
        return { remove: () => (changeListener = null) };
      },
    };
  },
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { useReduceMotion } from '../../src/panel/util/useReduceMotion';

function Harness({ onValue }: { onValue: (v: boolean) => void }): null {
  onValue(useReduceMotion());
  return null;
}

async function renderHook(onValue: (v: boolean) => void): Promise<void> {
  await act(async () => {
    renderer.create(React.createElement(Harness, { onValue }));
    // flush the isReduceMotionEnabled() promise
    await Promise.resolve();
  });
}

beforeEach(() => {
  reduceMotionValue = false;
  changeListener = null;
  hasApi = true;
});

describe('useReduceMotion', () => {
  it('defaults to false', async () => {
    let v = true;
    await renderHook(x => (v = x));
    expect(v).toBe(false);
  });

  it('reflects the initial OS value', async () => {
    reduceMotionValue = true;
    let v = false;
    await renderHook(x => (v = x));
    expect(v).toBe(true);
  });

  it('updates when the OS setting changes', async () => {
    const values: boolean[] = [];
    await renderHook(x => values.push(x));
    expect(changeListener).not.toBeNull();
    await act(async () => {
      changeListener!(true);
    });
    expect(values[values.length - 1]).toBe(true);
  });

  it('stays false and never throws when AccessibilityInfo is unavailable', async () => {
    hasApi = false;
    let v = true;
    await expect(renderHook(x => (v = x))).resolves.toBeUndefined();
    expect(v).toBe(false);
  });
});
