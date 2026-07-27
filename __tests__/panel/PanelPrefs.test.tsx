jest.mock('react-native', () => ({}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { PanelPrefsProvider, usePersistentState } from '../../src/panel/PanelPrefs';
import type { PanelPersistence } from '../../src/panel/PanelPrefs';

function fakeStore(initial: Record<string, string> = {}): PanelPersistence & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k: string) => (k in data ? data[k]! : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
  };
}

/** Harness exposing the hook's value + setter to the test. */
function Harness({ onReady }: { onReady: (v: string, set: (n: string) => void) => void }): null {
  const [value, setValue] = usePersistentState<string>('demo', 'default');
  onReady(value, setValue);
  return null;
}

function renderWith(
  persist: PanelPersistence | null,
  onReady: (v: string, s: (n: string) => void) => void
) {
  act(() => {
    renderer.create(
      React.createElement(
        PanelPrefsProvider,
        { value: persist },
        React.createElement(Harness, { onReady })
      )
    );
  });
}

describe('usePersistentState', () => {
  it('uses the default when nothing is stored', () => {
    let value = '';
    renderWith(fakeStore(), v => {
      value = v;
    });
    expect(value).toBe('default');
  });

  it('hydrates synchronously from the store (no flash of default)', () => {
    const store = fakeStore({ 'observability.panel.demo': JSON.stringify('saved') });
    let value = '';
    renderWith(store, v => {
      value = v;
    });
    expect(value).toBe('saved');
  });

  it('writes through to the store on set (namespaced + JSON)', () => {
    const store = fakeStore();
    let setter: ((n: string) => void) | null = null;
    renderWith(store, (_v, s) => {
      setter = s;
    });
    act(() => setter!('next'));
    expect(store.data['observability.panel.demo']).toBe(JSON.stringify('next'));
  });

  it('behaves like in-memory state when no persistence is provided', () => {
    let value = '';
    let setter: ((n: string) => void) | null = null;
    renderWith(null, (v, s) => {
      value = v;
      setter = s;
    });
    expect(value).toBe('default');
    expect(() => act(() => setter!('x'))).not.toThrow();
  });

  it('falls back to the default on a corrupt stored value', () => {
    const store = fakeStore({ 'observability.panel.demo': 'not json{' });
    let value = '';
    renderWith(store, v => {
      value = v;
    });
    expect(value).toBe('default');
  });
});
