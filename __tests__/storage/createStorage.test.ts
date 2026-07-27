import type { MMKVLike } from '../../src/storage/createStorage';

// Construct a fake `react-native-mmkv` module so the optional-peer load
// returns something callable. The MMKV stub records construction params
// so we can assert on the encryption key path.

const constructed: Array<{ id?: string; encryptionKey?: string }> = [];

class FakeMMKV implements MMKVLike {
  constructor(config: { id?: string; encryptionKey?: string }) {
    constructed.push({ ...config });
  }
  set(): void {}
  getString(): undefined {
    return undefined;
  }
  getNumber(): undefined {
    return undefined;
  }
  getBoolean(): undefined {
    return undefined;
  }
  contains(): boolean {
    return false;
  }
  delete(): void {}
  getAllKeys(): string[] {
    return [];
  }
}

jest.mock(
  'react-native-mmkv',

  () => ({ MMKV: FakeMMKV }),
  { virtual: true }
);

// Import after the mock is registered so loadOptionalPeer sees it.

const { createStorage } =
  require('../../src/storage/createStorage') as typeof import('../../src/storage/createStorage');

beforeEach(() => {
  constructed.length = 0;
});

describe('createStorage', () => {
  it('constructs an MMKV with the default id when none is given', () => {
    createStorage();
    expect(constructed).toHaveLength(1);
    expect(constructed[0]?.id).toBe('observability-storage');
    expect(constructed[0]?.encryptionKey).toBeUndefined();
  });

  it('honours a custom id', () => {
    createStorage({ id: 'my-app' });
    expect(constructed[0]?.id).toBe('my-app');
  });

  it('passes the encryption key through when enabled', () => {
    createStorage({ encryption: { enabled: true, key: 'a-sufficiently-long-key-1234' } });
    expect(constructed[0]?.encryptionKey).toBe('a-sufficiently-long-key-1234');
  });

  it('throws when encryption is enabled but the key is too short', () => {
    expect(() => createStorage({ encryption: { enabled: true, key: 'short' } })).toThrow(
      /at least 16 characters/
    );
  });

  it('does NOT pass encryptionKey when enabled is explicitly false', () => {
    createStorage({ encryption: { enabled: false, key: 'this-key-would-be-fine' } });
    expect(constructed[0]?.encryptionKey).toBeUndefined();
  });

  // The "package missing" path is covered by loadOptionalPeer's own tests in
  // __tests__/logger/loadOptionalPeer.test.ts; simulating "not installed"
  // inside this suite collides with the file-top jest.mock that establishes
  // react-native-mmkv as virtually present.
  //
  // The mmkv v4 `createMMKV` factory path is covered in createStorage.v4.test.ts
  // (a separate file, since this file's top-level jest.mock pins the v3 shape).
});
