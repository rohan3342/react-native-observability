import {
  trackScreen,
  getScreenStore,
  createScreenProvider,
  _resetScreenStore,
} from '../../../src/integrations/screen/trackScreen';
import { Logger } from '../../../src/logger/Logger';
import { LogLevel } from '../../../src/logger/types';

afterEach(() => {
  _resetScreenStore();
});

describe('trackScreen — basic mount/unmount', () => {
  it('records a mount event and returns an unmount callback', () => {
    const unmount = trackScreen('Accounts');
    expect(getScreenStore().getEvents()).toHaveLength(1);
    expect(getScreenStore().getEvents()[0]?.event).toBe('mount');
    expect(getScreenStore().getEvents()[0]?.screen).toBe('Accounts');

    unmount();
    expect(getScreenStore().getEvents()).toHaveLength(2);
    expect(getScreenStore().getEvents()[1]?.event).toBe('unmount');
  });

  it('records the params on both mount and unmount', () => {
    const params = { userId: 'u1' };
    const unmount = trackScreen('Accounts', params);
    unmount();
    const events = getScreenStore().getEvents();
    expect(events[0]?.params).toEqual(params);
    expect(events[1]?.params).toEqual(params);
  });

  it('stamps sessionId on events when provided', () => {
    const unmount = trackScreen('Accounts', undefined, { sessionId: 's-1' });
    unmount();
    const events = getScreenStore().getEvents();
    expect(events[0]?.sessionId).toBe('s-1');
    expect(events[1]?.sessionId).toBe('s-1');
  });

  it('omits sessionId when not provided', () => {
    const unmount = trackScreen('Accounts');
    unmount();
    const events = getScreenStore().getEvents();
    expect(events[0]?.sessionId).toBeUndefined();
  });
});

describe('trackScreen — logger integration', () => {
  it('logs screen:mount and screen:unmount when a logger is provided', () => {
    const writes: Array<{ namespace: string; message: string }> = [];
    const logger = new Logger({
      namespace: 'app',
      level: LogLevel.DEBUG,
      transports: [
        {
          name: 'capture',
          minLevel: LogLevel.DEBUG,
          write: e => writes.push({ namespace: e.namespace, message: e.message }),
        },
      ],
    });

    const unmount = trackScreen('Accounts', { id: 1 }, { logger });
    unmount();

    expect(writes).toHaveLength(2);
    expect(writes[0]?.message).toBe('screen:mount');
    expect(writes[1]?.message).toBe('screen:unmount');
  });

  it('does not log when no logger is provided', () => {
    const unmount = trackScreen('Accounts');
    unmount();
    // No assertion on console — just verify no crash and store still recorded
    expect(getScreenStore().getEvents()).toHaveLength(2);
  });
});

describe('getScreenStore — singleton', () => {
  it('returns the same instance across calls', () => {
    const a = getScreenStore();
    const b = getScreenStore();
    expect(a).toBe(b);
  });

  it('rebuilds after _resetScreenStore', () => {
    const a = getScreenStore();
    _resetScreenStore();
    const b = getScreenStore();
    expect(a).not.toBe(b);
  });
});

describe('createScreenProvider — resolution (idle window effectively open)', () => {
  // Use a huge idle window so these tests exercise pure screen resolution,
  // independent of timing (the idle behavior is covered separately below).
  const open = () => createScreenProvider({ idleMs: Number.MAX_SAFE_INTEGER });

  it('returns undefined when no screen is mounted', () => {
    expect(open()()).toBeUndefined();
  });

  it('returns the currently-mounted screen', () => {
    const provider = open();
    trackScreen('Home');
    expect(provider()).toBe('Home');
  });

  it('returns the latest-mounted screen when several are mounted (nested navigators)', () => {
    const provider = open();
    trackScreen('Home');
    trackScreen('Modal');
    expect(provider()).toBe('Modal');
  });

  it('falls back to undefined after the active screen unmounts', () => {
    const provider = open();
    const unmount = trackScreen('Home');
    expect(provider()).toBe('Home');
    unmount();
    expect(provider()).toBeUndefined();
  });

  it('reflects a navigation transition (unmount A, mount B)', () => {
    const provider = open();
    const leaveHome = trackScreen('Home');
    leaveHome();
    trackScreen('Settings');
    expect(provider()).toBe('Settings');
  });

  it('reads live from the store — the same provider tracks changes over time', () => {
    const provider = open();
    expect(provider()).toBeUndefined();
    const leaveA = trackScreen('A');
    expect(provider()).toBe('A');
    trackScreen('B');
    expect(provider()).toBe('B');
    leaveA();
    // A unmounted but B is still the most recent mount → still B
    expect(provider()).toBe('B');
  });
});

describe('createScreenProvider — idle window', () => {
  it('returns the screen for a call within the idle window of a mount (Case 1)', () => {
    // Splash mounts (real Date.now), then a provider clock just after.
    trackScreen('Splash');
    // Window is generous → the immediate call is attributed.
    const provider = createScreenProvider({ idleMs: 10_000 });
    expect(provider()).toBe('Splash');
  });

  it('returns undefined for an idle-time background call (Case 2)', () => {
    // Home mounts at real time T. The provider clock reports far in the future,
    // simulating a background call long after navigation settled.
    trackScreen('Home');
    const future = createScreenProvider({ idleMs: 1000, now: () => Date.now() + 60_000 });
    expect(future()).toBeUndefined();
  });

  it('defaults to a 1000ms idle window', () => {
    trackScreen('Home');
    const farFuture = createScreenProvider({ now: () => Date.now() + 5000 });
    expect(farFuture()).toBeUndefined();
  });
});
