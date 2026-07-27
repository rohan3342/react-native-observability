import { ScreenMountStore } from '../../../src/integrations/screen/ScreenMountStore';

describe('ScreenMountStore (new) — basics', () => {
  it('records events and exposes them via getEvents', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.record({ screen: 'A', event: 'unmount', timestamp: 5 });

    const events = store.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.event).toBe('mount');
    expect(events[1]?.event).toBe('unmount');
  });

  it('bounds retained events, evicting the oldest past the cap (NAV-3)', () => {
    const store = new ScreenMountStore(3);
    for (let i = 0; i < 6; i++) store.record({ screen: `S${i}`, event: 'mount', timestamp: i });
    const events = store.getEvents();
    expect(events).toHaveLength(3);
    expect(events.map(e => e.screen)).toEqual(['S3', 'S4', 'S5']);
  });

  it('does not require sessionId (drops v1 "unknown" default)', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    expect(store.getEvents()[0]?.sessionId).toBeUndefined();
  });

  it('accepts sessionId when provided', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1, sessionId: 's-1' });
    expect(store.getEvents()[0]?.sessionId).toBe('s-1');
  });
});

describe('ScreenMountStore (new) — getSummaries', () => {
  it('computes mountCount, totalTimeMs, currentlyMounted', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 100 });
    store.record({ screen: 'A', event: 'unmount', timestamp: 250 });
    store.record({ screen: 'A', event: 'mount', timestamp: 500 });

    const [a] = store.getSummaries();
    expect(a?.screen).toBe('A');
    expect(a?.mountCount).toBe(2);
    expect(a?.currentlyMounted).toBe(true);
    expect(a?.totalTimeMs).toBe(150); // 250-100
  });
});

describe('ScreenMountStore (new) — snapshot immutability', () => {
  it('returns a new reference on every mutation', () => {
    const store = new ScreenMountStore();
    const before = store.getSnapshot();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    const after = store.getSnapshot();
    expect(after).not.toBe(before);
  });

  it('previously-returned snapshots are not mutated', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    const snap = store.getSnapshot();
    expect(snap).toHaveLength(1);
    store.record({ screen: 'A', event: 'unmount', timestamp: 2 });
    expect(snap).toHaveLength(1);
  });
});

describe('ScreenMountStore (new) — subscribe', () => {
  it('notifies on record and clear', () => {
    const store = new ScreenMountStore();
    const listener = jest.fn();
    store.subscribe(listener);
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('unsubscribe stops further notifications', () => {
    const store = new ScreenMountStore();
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('ScreenMountStore — getMountedScreen (pure resolution)', () => {
  it('returns undefined when nothing is mounted', () => {
    const store = new ScreenMountStore();
    expect(store.getMountedScreen()).toBeUndefined();
  });

  it('returns the single mounted screen', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    expect(store.getMountedScreen()).toBe('A');
  });

  it('returns the latest-mounted screen when several are mounted', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.record({ screen: 'B', event: 'mount', timestamp: 2 });
    expect(store.getMountedScreen()).toBe('B');
  });

  it('returns undefined after the only screen unmounts', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.record({ screen: 'A', event: 'unmount', timestamp: 2 });
    expect(store.getMountedScreen()).toBeUndefined();
  });

  it('keeps the current screen when a different (non-current) screen unmounts', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.record({ screen: 'B', event: 'mount', timestamp: 2 });
    store.record({ screen: 'A', event: 'unmount', timestamp: 3 });
    // B was the latest mount and is still mounted → still current.
    expect(store.getMountedScreen()).toBe('B');
  });

  it('falls back to a still-mounted screen when the current one unmounts', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.record({ screen: 'B', event: 'mount', timestamp: 2 });
    store.record({ screen: 'B', event: 'unmount', timestamp: 3 });
    // B (the current) unmounted; A is still mounted → A becomes current.
    expect(store.getMountedScreen()).toBe('A');
  });

  it('handles a navigation transition (unmount then mount)', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'A', event: 'mount', timestamp: 1 });
    store.record({ screen: 'A', event: 'unmount', timestamp: 2 });
    store.record({ screen: 'B', event: 'mount', timestamp: 3 });
    expect(store.getMountedScreen()).toBe('B');
  });
});

describe('ScreenMountStore — getCurrentScreen (idle window)', () => {
  const IDLE = 1000;

  it('returns undefined when nothing is mounted', () => {
    const store = new ScreenMountStore();
    expect(store.getCurrentScreen(0, IDLE)).toBeUndefined();
  });

  it('returns the mounted screen while activity is recent (within idleMs)', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'Splash', event: 'mount', timestamp: 100 });
    // A call 500ms later is inside the window → tagged.
    expect(store.getCurrentScreen(600, IDLE)).toBe('Splash');
  });

  it('returns undefined once the window goes idle (Case 2: background call)', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'Home', event: 'mount', timestamp: 100 });
    // A background call 5s after navigation settled → window idle → untagged,
    // even though Home is still mounted.
    expect(store.getCurrentScreen(5100, IDLE)).toBeUndefined();
    // ...but Home is still structurally mounted.
    expect(store.getMountedScreen()).toBe('Home');
  });

  it('touchActivity extends the window (in-flight burst keeps the screen alive)', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'Home', event: 'mount', timestamp: 100 });
    // Just past idle from the mount...
    expect(store.getCurrentScreen(1200, IDLE)).toBeUndefined();
    // ...but a tagged request at 900 extended the window, so 1500 is active again.
    store.touchActivity(900);
    expect(store.getCurrentScreen(1500, IDLE)).toBe('Home');
  });

  it('treats now exactly at the idle boundary as still active', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'Home', event: 'mount', timestamp: 0 });
    expect(store.getCurrentScreen(1000, IDLE)).toBe('Home'); // == idleMs → active
    expect(store.getCurrentScreen(1001, IDLE)).toBeUndefined(); // > idleMs → idle
  });

  it('clear() resets the activity window', () => {
    const store = new ScreenMountStore();
    store.record({ screen: 'Home', event: 'mount', timestamp: 100 });
    store.clear();
    expect(store.getCurrentScreen(150, IDLE)).toBeUndefined();
  });
});
