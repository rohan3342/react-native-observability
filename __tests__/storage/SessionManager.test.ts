import {
  _resetSessionManager,
  endCurrentSession,
  getCurrentSessionId,
  getSessions,
  initSessionManager,
  reopenCurrentSession,
} from '../../src/storage/SessionManager';
import { MMKVTransport } from '../../src/storage/MMKVTransport';
import type { MMKVLike } from '../../src/storage/createStorage';
import { deserialize, serialize } from '../../src/storage/schema';
import type { SessionMeta } from '../../src/storage/types';

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

function fakeAppState(): {
  appState: { addEventListener: jest.Mock };
  fire: (state: string) => void;
  removed: { value: boolean };
} {
  let listener: ((s: string) => void) | null = null;
  const removed = { value: false };
  const appState = {
    addEventListener: jest.fn((_type: 'change', cb: (s: string) => void) => {
      listener = cb;
      return {
        remove: () => {
          removed.value = true;
        },
      };
    }),
  };
  return {
    appState,
    fire: (s: string) => listener?.(s),
    removed,
  };
}

beforeEach(() => {
  _resetSessionManager();
});

describe('initSessionManager — fresh launch', () => {
  it('allocates a new session id and persists it', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();

    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    expect(getCurrentSessionId()).toBeDefined();
    expect(getSessions()).toHaveLength(1);
    expect(getSessions()[0]?.sessionId).toBe(getCurrentSessionId());
  });

  it('returns a teardown function that removes the AppState listener', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();

    const end = initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    end();
    expect(fake.removed.value).toBe(true);
  });

  it('notifies passed transports of the new session id', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    const transport = new MMKVTransport({ storage: mmkv });
    const spy = jest.spyOn(transport, 'setSessionId');

    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      transports: [transport],
      appState: fake.appState,
    });

    expect(spy).toHaveBeenCalledWith(getCurrentSessionId());
  });
});

describe('initSessionManager — crash detection', () => {
  it('marks the prior session as crashed when its endTime is missing', () => {
    const mmkv = new FakeMMKV();
    const priorSession: SessionMeta = {
      sessionId: 'prior',
      startTime: 100,
      appVersion: '1.0.0',
      buildNumber: 1,
      // no endTime — simulating a crashed prior process
    };
    mmkv.set('t:sessions', serialize([priorSession]));

    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fakeAppState().appState,
    });

    const sessions = getSessions();
    const prior = sessions.find(s => s.sessionId === 'prior');
    expect(prior?.crashed).toBe(true);
  });

  it('leaves the prior session unmarked when endTime is present', () => {
    const mmkv = new FakeMMKV();
    const priorSession: SessionMeta = {
      sessionId: 'prior',
      startTime: 100,
      endTime: 200,
      appVersion: '1.0.0',
      buildNumber: 1,
    };
    mmkv.set('t:sessions', serialize([priorSession]));

    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fakeAppState().appState,
    });

    const prior = getSessions().find(s => s.sessionId === 'prior');
    expect(prior?.crashed).toBeUndefined();
  });
});

describe('initSessionManager — eviction', () => {
  it('trims sessions to maxSessions and deletes log keys for the evicted ones', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();

    // Seed three prior sessions, each with a log key
    const oldSessions: SessionMeta[] = [
      { sessionId: 'c', startTime: 300, endTime: 350, appVersion: '1', buildNumber: 1 },
      { sessionId: 'b', startTime: 200, endTime: 250, appVersion: '1', buildNumber: 1 },
      { sessionId: 'a', startTime: 100, endTime: 150, appVersion: '1', buildNumber: 1 },
    ];
    mmkv.set('t:sessions', serialize(oldSessions));
    mmkv.set('t:l:a:0', 'data-a');
    mmkv.set('t:l:b:0', 'data-b');
    mmkv.set('t:l:c:0', 'data-c');

    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      maxSessions: 2,
      appState: fake.appState,
    });

    // After init: current + 1 prior (b) retained; 'a' and 'c' evicted (oldest by list position)
    const ids = getSessions().map(s => s.sessionId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(getCurrentSessionId());
    // The retained prior is whichever was at index 0 of the loaded list (c)
    expect(ids[1]).toBe('c');

    // Evicted sessions had their log keys cleaned
    expect(mmkv.contains('t:l:a:0')).toBe(false);
    expect(mmkv.contains('t:l:b:0')).toBe(false);
    expect(mmkv.contains('t:l:c:0')).toBe(true); // retained
  });
});

describe('endCurrentSession', () => {
  it('writes endTime onto the current session entry', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    endCurrentSession();

    const persisted = mmkv.getString('t:sessions');
    expect(persisted).toBeDefined();
    const result = deserialize<SessionMeta[]>(persisted!);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const current = result.payload.find(s => s.sessionId === getCurrentSessionId());
      expect(current?.endTime).toBeDefined();
    }
  });

  it('is fired automatically on AppState "background"', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    fake.fire('background');

    const result = deserialize<SessionMeta[]>(mmkv.getString('t:sessions')!);
    if (result.ok) {
      const current = result.payload.find(s => s.sessionId === getCurrentSessionId());
      expect(current?.endTime).toBeDefined();
    }
  });

  it('is fired automatically on AppState "inactive" (iOS suspends via inactive without background)', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    fake.fire('inactive');

    const result = deserialize<SessionMeta[]>(mmkv.getString('t:sessions')!);
    if (result.ok) {
      const current = result.payload.find(s => s.sessionId === getCurrentSessionId());
      expect(current?.endTime).toBeDefined();
    }
  });

  it('is a no-op when the manager is not initialized', () => {
    expect(() => endCurrentSession()).not.toThrow();
  });
});

describe('reopenCurrentSession — transient blip recovery', () => {
  it('clears endTime so a brief inactive→active blip does not close a live session', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    // Control-center / incoming-call overlay: inactive then back to active.
    fake.fire('inactive');
    let result = deserialize<SessionMeta[]>(mmkv.getString('t:sessions')!);
    if (result.ok) {
      const current = result.payload.find(s => s.sessionId === getCurrentSessionId());
      expect(current?.endTime).toBeDefined();
    }

    fake.fire('active');
    result = deserialize<SessionMeta[]>(mmkv.getString('t:sessions')!);
    if (result.ok) {
      const current = result.payload.find(s => s.sessionId === getCurrentSessionId());
      expect(current?.endTime).toBeUndefined();
    }
  });

  it('called directly clears a previously written endTime', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    endCurrentSession();
    reopenCurrentSession();

    const result = deserialize<SessionMeta[]>(mmkv.getString('t:sessions')!);
    if (result.ok) {
      const current = result.payload.find(s => s.sessionId === getCurrentSessionId());
      expect(current?.endTime).toBeUndefined();
    }
  });

  it('is a no-op when the manager is not initialized', () => {
    expect(() => reopenCurrentSession()).not.toThrow();
  });
});

describe('getCurrentSessionId / getSessions before init', () => {
  it('returns undefined / [] before initSessionManager runs', () => {
    expect(getCurrentSessionId()).toBeUndefined();
    expect(getSessions()).toEqual([]);
  });
});

describe('integration — getCurrentSessionId fits Logger.sessionIdProvider', () => {
  it('initSessionManager + Logger.sessionIdProvider stamps entries with the session id', () => {
    const mmkv = new FakeMMKV();
    const fake = fakeAppState();
    initSessionManager(mmkv, {
      appVersion: '1.0.0',
      buildNumber: 1,
      appState: fake.appState,
    });

    // Build a logger that uses getCurrentSessionId as the provider

    const { Logger } =
      require('../../src/logger/Logger') as typeof import('../../src/logger/Logger');

    const { LogLevel } =
      require('../../src/logger/types') as typeof import('../../src/logger/types');

    const writes: Array<{ sessionId: string | undefined }> = [];
    const logger = new Logger({
      namespace: 'test',
      level: LogLevel.DEBUG,
      transports: [
        {
          name: 'capture',
          minLevel: LogLevel.DEBUG,
          write: e => writes.push({ sessionId: e.sessionId }),
        },
      ],
      sessionIdProvider: getCurrentSessionId,
    });

    logger.info('hello');

    expect(writes[0]?.sessionId).toBe(getCurrentSessionId());
  });
});
