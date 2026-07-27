const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Monorepo root is two levels up: examples/bare → repo root.
const workspaceRoot = path.resolve(projectRoot, '..', '..');

/**
 * Metro config for the bare example inside a pnpm workspace.
 * Mirrors the Expo example's setup: watch the workspace root and resolve
 * modules from both the local and root node_modules so the linked
 * `react-native-observability` package resolves through symlinks.
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // pnpm uses a symlinked store — Metro must follow symlinks and honour the
    // linked package's `exports` map (react-native-observability uses sub-paths).
    unstable_enableSymlinks: true,
    unstable_enablePackageExports: true,
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
