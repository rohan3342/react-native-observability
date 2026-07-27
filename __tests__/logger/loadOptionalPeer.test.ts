import { loadOptionalPeer } from '../../src/logger/util/loadOptionalPeer';

describe('loadOptionalPeer', () => {
  const globalScope = globalThis as unknown as { __DEV__: boolean | undefined };
  const originalDev = globalScope.__DEV__;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
    globalScope.__DEV__ = originalDev;
  });

  it('returns the module when the package is resolvable', () => {
    // Jest itself is always resolvable in the test environment.
    const jestPkg = loadOptionalPeer<{ name: string }>('jest/package.json');
    expect(jestPkg).not.toBeNull();
    expect(jestPkg?.name).toBe('jest');
  });

  it('returns null when the package is missing', () => {
    globalScope.__DEV__ = false;
    const result = loadOptionalPeer<unknown>('observability-definitely-not-a-real-package');
    expect(result).toBeNull();
  });

  it('emits a single console.warn on miss when __DEV__ is true', () => {
    globalScope.__DEV__ = true;
    loadOptionalPeer<unknown>('observability-also-not-real');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('observability-also-not-real');
    expect(warnSpy.mock.calls[0]?.[0]).toContain('disabled');
  });

  it('does not warn on miss when __DEV__ is false', () => {
    globalScope.__DEV__ = false;
    loadOptionalPeer<unknown>('observability-still-not-real');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('does not throw when the package is missing', () => {
    globalScope.__DEV__ = false;
    expect(() => loadOptionalPeer<unknown>('observability-not-installed')).not.toThrow();
  });
});
