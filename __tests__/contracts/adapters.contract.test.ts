import { runAdapterContract } from './adapterContract';
import { createCustomAdapter } from '../../src/adapters/createCustomAdapter';
import { LogLevel } from '../../src/logger/types';

// Every shipped adapter must satisfy the same contract. `createCustomAdapter`
// is the only built-in adapter factory — the three vendor adapters (Sentry,
// Crashlytics, PostHog) were removed; use `createCustomAdapter` for any backend.
runAdapterContract('createCustomAdapter', () =>
  createCustomAdapter({
    name: 'custom',
    minLevel: LogLevel.ERROR,
    captureException: () => {},
    captureMessage: () => {},
    setUser: () => {},
    setContext: () => {},
    flush: () => Promise.resolve(),
  })
);
