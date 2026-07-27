import { observeReactNavigation } from '../../../src/observers/react-navigation/observeReactNavigation';
import { getScreenStore, _resetScreenStore } from '../../../src/integrations/screen/trackScreen';

interface FakeRoute {
  name: string;
  params?: Record<string, unknown>;
  key?: string;
}

function fakeRef(initial: FakeRoute | undefined = undefined): {
  current: { getCurrentRoute: () => FakeRoute | undefined };
  set: (r: FakeRoute | undefined) => void;
} {
  let route = initial;
  return {
    current: {
      getCurrentRoute: () => route,
    },
    set: (r: FakeRoute | undefined) => {
      route = r;
    },
  };
}

afterEach(() => {
  _resetScreenStore();
});

describe('observeReactNavigation — pipeline', () => {
  it('records a mount on the first onStateChange', () => {
    const ref = fakeRef({ name: 'A', key: 'k1' });
    const observer = observeReactNavigation(ref);

    observer.onStateChange();

    const events = getScreenStore().getEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toBe('mount');
    expect(events[0]?.screen).toBe('A');
  });

  it('records unmount(A) + mount(B) when navigating to a new screen', () => {
    const ref = fakeRef({ name: 'A', key: 'k1' });
    const observer = observeReactNavigation(ref);

    observer.onStateChange();
    ref.set({ name: 'B', key: 'k2' });
    observer.onStateChange();

    const events = getScreenStore().getEvents();
    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ screen: 'A', event: 'mount' });
    expect(events[1]).toMatchObject({ screen: 'A', event: 'unmount' });
    expect(events[2]).toMatchObject({ screen: 'B', event: 'mount' });
  });

  it('does NOT re-fire when onStateChange is called with the same route key', () => {
    const ref = fakeRef({ name: 'A', key: 'k1' });
    const observer = observeReactNavigation(ref);

    observer.onStateChange();
    observer.onStateChange();
    observer.onStateChange();

    expect(getScreenStore().getEvents()).toHaveLength(1);
  });

  it('treats same-name-different-key as a new screen (stack push)', () => {
    const ref = fakeRef({ name: 'A', key: 'k1' });
    const observer = observeReactNavigation(ref);

    observer.onStateChange();
    ref.set({ name: 'A', key: 'k2' }); // same name, fresh stack push
    observer.onStateChange();

    const events = getScreenStore().getEvents();
    expect(events.map(e => ({ screen: e.screen, event: e.event }))).toEqual([
      { screen: 'A', event: 'mount' },
      { screen: 'A', event: 'unmount' },
      { screen: 'A', event: 'mount' },
    ]);
  });

  it('falls back to route name when key is absent', () => {
    const ref = fakeRef({ name: 'A' });
    const observer = observeReactNavigation(ref);

    observer.onStateChange();
    observer.onStateChange();

    expect(getScreenStore().getEvents()).toHaveLength(1);
  });

  it('is a no-op when getCurrentRoute returns undefined', () => {
    const ref = fakeRef(undefined);
    const observer = observeReactNavigation(ref);

    observer.onStateChange();
    expect(getScreenStore().getEvents()).toHaveLength(0);
  });

  it('accepts a plain ref-shape (no .current wrapper)', () => {
    const observer = observeReactNavigation({
      getCurrentRoute: () => ({ name: 'A', key: 'k1' }),
    });

    observer.onStateChange();
    expect(getScreenStore().getEvents()[0]?.screen).toBe('A');
  });

  it('dispose() fires the dangling unmount for the last screen', () => {
    const ref = fakeRef({ name: 'A', key: 'k1' });
    const observer = observeReactNavigation(ref);

    observer.onStateChange();
    observer.dispose();

    const events = getScreenStore().getEvents();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ screen: 'A', event: 'unmount' });
  });

  it('dispose() is a no-op when no screen is currently tracked', () => {
    const observer = observeReactNavigation({ getCurrentRoute: () => undefined });
    expect(() => observer.dispose()).not.toThrow();
    expect(getScreenStore().getEvents()).toHaveLength(0);
  });

  it('forwards params and sessionId to trackScreen', () => {
    const ref = fakeRef({ name: 'A', key: 'k1', params: { id: 1 } });
    const observer = observeReactNavigation(ref, { sessionId: 's-1' });

    observer.onStateChange();
    const e = getScreenStore().getEvents()[0];
    expect(e?.params).toEqual({ id: 1 });
    expect(e?.sessionId).toBe('s-1');
  });
});
