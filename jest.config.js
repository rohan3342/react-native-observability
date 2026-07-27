/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  // Reset the global metrics/kill-switch/panic singleton before every test so
  // singleton state can't leak across suites in a shared worker.
  setupFilesAfterEnv: ['<rootDir>/__tests__/jest.setup.ts'],
  globals: {
    // React Native global — true so ConsoleTransport doesn't suppress output in tests
    __DEV__: true,
  },
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.d.ts', '!src/**/index.ts'],
  coverageReporters: ['text-summary', 'lcov'],
  // Ratchet set just below the current real numbers (lines 90.2 / stmts 88.88 /
  // funcs 83.02 / branch 73.89 as of 2026-07-27) so it gates regressions without
  // being brittle. Raise these as coverage climbs; never lower them silently.
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 88,
      functions: 80,
      branches: 72,
    },
  },
};
