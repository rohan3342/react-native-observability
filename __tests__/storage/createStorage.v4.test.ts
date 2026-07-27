// react-native-mmkv v4 (Nitro) removed the `MMKV` class and exports a
// `createMMKV(config)` factory instead. createStorage() must support it. This
// file mocks the v4 shape at the top level (a separate file from the v3 suite,
// whose top-level mock pins the class shape).

const constructed: Array<{ id?: string; encryptionKey?: string }> = [];
const removed: string[] = [];

// v4 instances expose `remove(key)`, NOT `delete(key)` — createStorage must
// normalise so callers can still use `.delete()`.
function fakeInstance() {
  return {
    set() {},
    getString: () => undefined,
    getNumber: () => undefined,
    getBoolean: () => undefined,
    contains: () => false,
    remove: (k: string) => void removed.push(k),
    getAllKeys: () => [],
  };
}

jest.mock(
  'react-native-mmkv',
  () => ({
    createMMKV: (config: { id?: string; encryptionKey?: string }) => {
      constructed.push({ ...config });
      return fakeInstance();
    },
  }),
  { virtual: true }
);

const { createStorage } =
  require('../../src/storage/createStorage') as typeof import('../../src/storage/createStorage');

beforeEach(() => {
  constructed.length = 0;
  removed.length = 0;
});

describe('createStorage — mmkv v4 createMMKV factory', () => {
  it('uses the factory and defaults the id', () => {
    createStorage();
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.id).toBe('observability-storage');
  });

  it('honours a custom id', () => {
    createStorage({ id: 'v4-app' });
    expect(constructed[0]?.id).toBe('v4-app');
  });

  it('passes the encryption key through when enabled', () => {
    createStorage({ encryption: { enabled: true, key: 'a-sufficiently-long-key-1234' } });
    expect(constructed[0]?.encryptionKey).toBe('a-sufficiently-long-key-1234');
  });

  it('normalises v4 `remove` to the `delete` the toolkit calls', () => {
    const storage = createStorage();
    // The returned MMKVLike exposes .delete(); on a v4 instance it must route to
    // the underlying .remove().
    storage.delete('some-key');
    expect(removed).toEqual(['some-key']);
  });
});
