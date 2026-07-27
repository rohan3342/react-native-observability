import { LogLevel } from '../../src/logger/types';
import { ObservabilityConfig } from '../../src/config/ObservabilityConfig';
import type { ObservabilityConfig as ObservabilityConfigType } from '../../src/config/types';
import { ConsoleTransport } from '../../src/logger/transports/ConsoleTransport';

const minimalConfig: ObservabilityConfigType = {
  app: {
    name: 'TestApp',
    version: '1.0.0',
    buildNumber: 1,
    buildType: 'development',
  },
  logger: {
    namespace: 'test',
    level: LogLevel.DEBUG,
    transports: [new ConsoleTransport()],
  },
};

afterEach(() => {
  ObservabilityConfig.reset();
});

describe('ObservabilityConfig — init', () => {
  it('stores config and returns it via get()', () => {
    ObservabilityConfig.init(minimalConfig);

    const result = ObservabilityConfig.get();
    expect(result.app.name).toBe('TestApp');
    expect(result.logger.namespace).toBe('test');
  });

  it('returns a frozen object', () => {
    ObservabilityConfig.init(minimalConfig);

    const result = ObservabilityConfig.get();
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('throws when init() is called a second time', () => {
    ObservabilityConfig.init(minimalConfig);

    expect(() => ObservabilityConfig.init(minimalConfig)).toThrow(
      /ObservabilityConfig\.init\(\) has already been called/
    );
  });
});

describe('ObservabilityConfig — get', () => {
  it('throws when called before init()', () => {
    expect(() => ObservabilityConfig.get()).toThrow(
      /ObservabilityConfig\.get\(\) called before ObservabilityConfig\.init\(\)/
    );
  });
});

describe('ObservabilityConfig — reset', () => {
  it('allows init() to be called again after reset()', () => {
    ObservabilityConfig.init(minimalConfig);
    ObservabilityConfig.reset();

    const updated: ObservabilityConfig = {
      ...minimalConfig,
      app: { ...minimalConfig.app, name: 'UpdatedApp' },
    };
    ObservabilityConfig.init(updated);

    expect(ObservabilityConfig.get().app.name).toBe('UpdatedApp');
  });

  it('causes get() to throw after reset()', () => {
    ObservabilityConfig.init(minimalConfig);
    ObservabilityConfig.reset();

    expect(() => ObservabilityConfig.get()).toThrow();
  });
});

describe('ObservabilityConfig — optional config fields', () => {
  it('stores storage config when provided', () => {
    ObservabilityConfig.init({
      ...minimalConfig,
      storage: { enabled: true, maxSessions: 3 },
    });

    expect(ObservabilityConfig.get().storage?.enabled).toBe(true);
    expect(ObservabilityConfig.get().storage?.maxSessions).toBe(3);
  });

  it('stores debugPanel config when provided', () => {
    ObservabilityConfig.init({
      ...minimalConfig,
      debugPanel: { enabled: true, tabs: ['logs', 'network'] },
    });

    expect(ObservabilityConfig.get().debugPanel?.enabled).toBe(true);
    expect(ObservabilityConfig.get().debugPanel?.tabs).toEqual(['logs', 'network']);
  });
});
