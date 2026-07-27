import { defineConfig } from 'tsup';
import { version } from './package.json';

export default defineConfig({
  // Inject the package version at build time so nothing hardcodes (and drifts
  // from) it — the panel reads `__OBSERVABILITY_VERSION__`.
  define: { __OBSERVABILITY_VERSION__: JSON.stringify(version) },
  entry: {
    index: 'src/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'storage/index': 'src/storage/index.ts',
    'panel/index': 'src/panel/index.ts',
    'observers/axios': 'src/observers/axios/index.ts',
    'observers/fetch': 'src/observers/fetch/index.ts',
    'observers/graphql': 'src/observers/graphql/index.ts',
    'observers/react-navigation': 'src/observers/react-navigation/index.ts',
    'observers/react-query': 'src/observers/react-query/index.ts',
    'observers/trpc': 'src/observers/trpc/index.ts',
    'observers/apollo': 'src/observers/apollo/index.ts',
    'observers/urql': 'src/observers/urql/index.ts',
    'observers/rtk-query': 'src/observers/rtk-query/index.ts',
  },
  format: ['cjs', 'esm'], // Produce both — one command, both outputs
  dts: true, // Generate .d.ts + .d.mts alongside each output file
  sourcemap: true,
  clean: true, // Wipe dist/ before each build — no stale artifacts
  treeshake: true,
  external: [
    // Never bundle peer deps — consumer already has them. Includes the
    // GraphQL-client / RTK observer peers: those shims don't runtime-import them
    // today, but listing them keeps any future import externalized (audit CFG-4).
    'react',
    'react-native',
    '@sentry/react-native',
    '@react-native-firebase/crashlytics',
    'posthog-react-native',
    'react-native-mmkv',
    'react-native-safe-area-context',
    'axios',
    '@react-navigation/native',
    '@tanstack/react-query',
    '@trpc/client',
    '@apollo/client',
    '@urql/core',
    '@reduxjs/toolkit',
    'graphql',
  ],
  esbuildOptions(options) {
    options.jsx = 'automatic'; // React 17+ JSX transform — no import React needed
  },
});
