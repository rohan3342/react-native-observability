import { loadOptionalPeer } from '../logger/util/loadOptionalPeer';
import type { CreateStorageOptions } from './types';

/**
 * Minimal MMKV surface used by Observability. The real `react-native-mmkv` `MMKV`
 * class is structurally compatible with this interface.
 */
export interface MMKVLike {
  set(key: string, value: string | number | boolean): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  contains(key: string): boolean;
  delete(key: string): void;
  getAllKeys(): string[];
}

/** Construction config shared by both the v3 class and the v4 factory. */
interface MMKVConfig {
  id?: string;
  encryptionKey?: string;
}

/**
 * The raw instance shape across mmkv major versions. Methods are mostly stable,
 * but key deletion was renamed: v3 exposes `delete(key)`, v4 (Nitro) renamed it
 * to `remove(key)`. We accept either and normalise to {@link MMKVLike}.
 */
interface RawMMKVInstance {
  set(key: string, value: string | number | boolean): void;
  getString(key: string): string | undefined;
  getNumber(key: string): number | undefined;
  getBoolean(key: string): boolean | undefined;
  contains(key: string): boolean;
  getAllKeys(): string[];
  /** v3 deletion. */
  delete?(key: string): void;
  /** v4 deletion (renamed from `delete`). */
  remove?(key: string): void;
}

/**
 * The shape of `react-native-mmkv` across major versions. v3 (and earlier)
 * exports an `MMKV` **class** (`new MMKV(config)`); v4 (Nitro-based) removed the
 * class and exports a `createMMKV(config)` **factory** instead. We support
 * whichever is present so the toolkit works on either line.
 */
interface MMKVModule {
  MMKV?: new (config: MMKVConfig) => RawMMKVInstance;
  createMMKV?: (config: MMKVConfig) => RawMMKVInstance;
}

/**
 * Wrap a raw mmkv instance in the stable {@link MMKVLike} surface, bridging the
 * v3 `delete` / v4 `remove` rename so the rest of the toolkit (MMKVTransport,
 * SessionManager) can call `.delete()` regardless of the installed major.
 */
function normaliseInstance(raw: RawMMKVInstance): MMKVLike {
  return {
    set: (k, v) => raw.set(k, v),
    getString: k => raw.getString(k),
    getNumber: k => raw.getNumber(k),
    getBoolean: k => raw.getBoolean(k),
    contains: k => raw.contains(k),
    getAllKeys: () => raw.getAllKeys(),
    delete: k => {
      if (typeof raw.delete === 'function') raw.delete(k);
      else if (typeof raw.remove === 'function') raw.remove(k);
    },
  };
}

const MIN_KEY_LENGTH = 16;

/**
 * Constructs a dedicated MMKV instance for Observability storage.
 *
 * `react-native-mmkv` is an **optional** peer dependency. When it is not
 * installed, this function throws — call sites that depend on persistence
 * should guard the call (`if (storageConfigEnabled)`).
 *
 * **Encryption.** `react-native-mmkv` uses **AES-CFB** under the hood, not
 * AES-GCM. CFB provides confidentiality (protects against backup or
 * sideloaded-app inspection) but **not** integrity — there is no
 * authentication tag. Consumers needing AEAD should layer their own
 * encryption above this API.
 *
 * The encryption key must be at least 16 characters. Source it from
 * `react-native-keychain` / `expo-secure-store` / equivalent. Never hard-code
 * it, and never derive it from publicly-known values (bundle id, package
 * name, build number) — those are not secrets.
 *
 * @throws if `react-native-mmkv` is not installed.
 * @throws if `encryption.enabled` is true and `key.length < 16`.
 *
 * @example
 * ```ts
 * import { createStorage } from 'react-native-observability/storage';
 *
 * const storage = createStorage({
 *   id: 'my-app-observability',
 *   encryption: { enabled: true, key: await getKeychainSecret('observability-key') },
 * });
 * ```
 */
export function createStorage(config: CreateStorageOptions = {}): MMKVLike {
  const mod = loadOptionalPeer<MMKVModule>('react-native-mmkv');
  if (mod === null) {
    throw new Error(
      '[observability] createStorage() requires `react-native-mmkv` to be installed. ' +
        'Install it as a peer dependency before calling createStorage().'
    );
  }

  const options: { id?: string; encryptionKey?: string } = {
    id: config.id ?? 'observability-storage',
  };

  if (config.encryption?.enabled === true) {
    const key = config.encryption.key;
    if (typeof key !== 'string' || key.length < MIN_KEY_LENGTH) {
      throw new Error(
        `[observability] createStorage(): encryption.key must be a string of at least ${MIN_KEY_LENGTH} characters. ` +
          'Source it from a secure-storage primitive (Keychain / Keystore / expo-secure-store).'
      );
    }
    options.encryptionKey = key;
  }

  // v4 (Nitro) factory first, then the v3 class. The v4 `Configuration.id` is
  // required, so default it before calling the factory. Normalise the instance
  // so the v3 `delete` / v4 `remove` rename is invisible to callers.
  if (typeof mod.createMMKV === 'function') {
    return normaliseInstance(
      mod.createMMKV({ id: options.id ?? 'observability-storage', ...options })
    );
  }
  if (typeof mod.MMKV === 'function') {
    return normaliseInstance(new mod.MMKV(options));
  }
  throw new Error(
    '[observability] createStorage(): the installed `react-native-mmkv` exposes neither ' +
      '`createMMKV` (v4+) nor the `MMKV` class (v3). Unsupported version.'
  );
}
