/**
 * Minimal type shim for `react-native-mmkv`.
 * Consumers must install `react-native-mmkv` as an optional peer dependency
 * to use `MMKVTransport`. This shim exists only to satisfy the TypeScript
 * compiler when the package is not installed in the library's own devDependencies.
 */
declare module 'react-native-mmkv' {
  export interface MMKVConfiguration {
    id?: string;
    path?: string;
    encryptionKey?: string;
  }

  export class MMKV {
    constructor(configuration?: MMKVConfiguration);
    set(key: string, value: string | number | boolean): void;
    getString(key: string): string | undefined;
    getNumber(key: string): number | undefined;
    getBoolean(key: string): boolean | undefined;
    delete(key: string): void;
    contains(key: string): boolean;
    clearAll(): void;
    getAllKeys(): string[];
  }
}
