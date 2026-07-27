import { _resetMetrics } from '../src/logger/internal/metrics';

/**
 * The internal metrics + kill-switch + panic state is a process-global singleton
 * (by design — it describes the whole SDK). Reset it before every test so a
 * suite that trips panic / sets the kill-switch / floods counters can never leak
 * that state into another suite sharing the same jest worker.
 */
beforeEach(() => {
  _resetMetrics();
});

/**
 * Suppress act() warnings in tests that are artifacts of the react-native mock.
 * The `useReduceMotion` hook calls `AccessibilityInfo.isReduceMotionEnabled()` which
 * returns a resolved promise in tests. React warns about state updates in async
 * callbacks, but the hook properly checks the mounted flag before updating, so
 * these warnings are spurious test artifacts, not real issues.
 */
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args) => {
    const message = String(args[0] ?? '');
    // Suppress react-test-renderer act() warnings for useReduceMotion async updates
    if (message.includes('Warning: An update to') && message.includes('was not wrapped in act')) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args) => {
    const message = String(args[0] ?? '');
    // Suppress expected [observability] warnings from error handling tests that verify
    // the logger correctly handles and logs adapter/transport failures
    if (message.includes('[observability]')) {
      return;
    }
    originalWarn.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});
