import { SliceRegistry } from '../../src/panel/SliceRegistry';

describe('SliceRegistry', () => {
  it('starts with an empty snapshot', () => {
    const r = new SliceRegistry();
    expect(r.getSnapshot()).toEqual([]);
  });

  it('register() adds a name to the snapshot', () => {
    const r = new SliceRegistry();
    r.register('user', () => ({ id: 1 }));
    expect(r.getSnapshot()).toEqual(['user']);
  });

  it('snapshot is sorted alphabetically for stable rendering', () => {
    const r = new SliceRegistry();
    r.register('z', () => 1);
    r.register('a', () => 2);
    r.register('m', () => 3);
    expect(r.getSnapshot()).toEqual(['a', 'm', 'z']);
  });

  it('re-registering an existing name replaces the previous selector', () => {
    const r = new SliceRegistry();
    r.register('user', () => 'first');
    r.register('user', () => 'second');
    expect(r.getSnapshot()).toEqual(['user']);
    expect(r.get('user')!()).toBe('second');
  });

  it('register() returns an unregister function that removes the name', () => {
    const r = new SliceRegistry();
    const unregister = r.register('user', () => 1);
    expect(r.getSnapshot()).toEqual(['user']);
    unregister();
    expect(r.getSnapshot()).toEqual([]);
  });

  it('unregister callback is idempotent', () => {
    const r = new SliceRegistry();
    const unregister = r.register('user', () => 1);
    unregister();
    unregister();
    expect(r.getSnapshot()).toEqual([]);
  });

  it('stale unregister does not remove a re-registered slice', () => {
    const r = new SliceRegistry();
    const stale = r.register('user', () => 'first');
    r.register('user', () => 'second');
    stale(); // should not remove because the current selector is "second"
    expect(r.getSnapshot()).toEqual(['user']);
    expect(r.get('user')!()).toBe('second');
  });

  it('notifies subscribers on register and unregister', () => {
    const r = new SliceRegistry();
    const listener = jest.fn();
    r.subscribe(listener);

    const u = r.register('user', () => 1);
    expect(listener).toHaveBeenCalledTimes(1);

    u();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('subscribe returns an unsubscribe function', () => {
    const r = new SliceRegistry();
    const listener = jest.fn();
    const unsub = r.subscribe(listener);
    unsub();
    r.register('user', () => 1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('snapshot identity changes on every mutation (useSyncExternalStore safe)', () => {
    const r = new SliceRegistry();
    const before = r.getSnapshot();
    r.register('user', () => 1);
    const after = r.getSnapshot();
    expect(after).not.toBe(before);
  });

  it('get() returns undefined for unknown names', () => {
    const r = new SliceRegistry();
    expect(r.get('missing')).toBeUndefined();
  });
});
