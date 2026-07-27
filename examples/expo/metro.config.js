const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Repo root is TWO levels up: examples/expo → examples → repo root.
const workspaceRoot = path.resolve(projectRoot, '..', '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the workspace root so changes to the linked library are picked up.
config.watchFolders = [workspaceRoot];

// 2. Resolve modules from both the local and the root node_modules.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. pnpm uses a symlinked store — Metro must follow symlinks and honour the
//    package `exports` map (the linked `react-native-observability` uses sub-paths).
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
