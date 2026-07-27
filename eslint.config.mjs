import tseslint from 'typescript-eslint';
import pluginReact from 'eslint-plugin-react';
import pluginBoundaries from 'eslint-plugin-boundaries';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

/**
 * ESLint flat config for react-native-observability.
 *
 * Layered architecture is enforced by `eslint-plugin-boundaries`. See plan S3 / DR-2.
 * The element definitions below describe the CURRENT (v1) source layout.
 * They will be re-pointed to the v2 layout (`core/`, `observers/`) during Phase 0b.
 */
export default tseslint.config(
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  eslintPluginPrettier,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      react: pluginReact,
      boundaries: pluginBoundaries,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: {
        version: '18.3.1',
      },
      'boundaries/elements': [
        // Layer 1 — core (zero peer-dep imports allowed)
        { type: 'core-logger', pattern: 'src/logger/**' },
        { type: 'core-config', pattern: 'src/config/**' },
        { type: 'globals', pattern: 'src/{globals.d.ts,shims/**}' },
        // Layer 2 — effects
        { type: 'adapters', pattern: 'src/adapters/**' },
        { type: 'error-boundary', pattern: 'src/error-boundary/**' },
        { type: 'storage', pattern: 'src/storage/**' },
        // Layer 3 — integration primitives (current layout: vendor-named; renamed in step 8)
        { type: 'integrations', pattern: 'src/integrations/**' },
        // Layer 4 — vendor observer shims (one folder per vendor)
        { type: 'vendor-observer', pattern: 'src/observers/**' },
        // Layer 5 — UI (panel)
        { type: 'panel', pattern: 'src/panel/**' },
        // Barrel
        { type: 'barrel', pattern: 'src/index.ts', mode: 'file' },
      ],
      'boundaries/ignore': ['**/*.test.{ts,tsx}'],
    },
    rules: {
      // React
      'react/react-in-jsx-scope': 'off',

      // Boundaries: enforce layering. Core may not import from higher layers.
      'boundaries/element-types': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['core-logger', 'core-config'],
              disallow: ['adapters', 'error-boundary', 'storage', 'integrations', 'panel'],
              message: 'Core (Layer 1) MUST NOT import from higher layers. See plan S3.',
            },
            {
              from: ['adapters'],
              disallow: ['error-boundary', 'storage', 'integrations', 'panel'],
              message: 'Adapters (Layer 2) may only import from core. See plan S3.',
            },
            {
              from: ['error-boundary'],
              disallow: ['integrations', 'adapters', 'storage', 'panel'],
              message: 'Error boundary (Layer 2) may only import from core. See plan S3.',
            },
            {
              from: ['storage'],
              disallow: ['adapters', 'error-boundary', 'integrations', 'panel'],
              message: 'Storage (Layer 2) may only import from core. See plan S3.',
            },
            {
              from: ['integrations'],
              disallow: ['panel'],
              message: 'Integrations (Layer 3) MUST NOT import from the UI layer. See plan S3.',
            },
            {
              from: ['vendor-observer'],
              // Vendor observers may import from core/integrations but must
              // not import from another vendor observer (no cross-vendor coupling)
              // and not from the UI layer.
              disallow: ['vendor-observer', 'panel'],
              message:
                'Vendor observers (Layer 4) must not import from other vendor observers or the UI layer.',
            },
          ],
        },
      ],

      // Prevent the v1 anti-pattern: top-level require() of an optional peer dep.
      // require() of an optional peer MUST live inside a constructor or function body
      // so the module parses successfully when the peer is absent.
      // (See audit findings I6, I7.) Enforced for now via no-restricted-syntax; will
      // be replaced by a custom rule + the `loadOptionalPeer` helper in Phase 5.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Program > VariableDeclaration > VariableDeclarator[init.type='TryStatement']",
          message:
            'Top-level try { require(optional-peer) } is forbidden. Wrap the require() in a constructor or use loadOptionalPeer().',
        },
      ],

      // Type-discipline
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],

      // Prettier
      'prettier/prettier': 'error',
    },
  },

  // Example apps — looser ruleset; not part of the published package.
  {
    files: ['examples/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // Tests — not shipped. `require()` after `jest.mock(...)` is the sanctioned
  // way to import a module only once its optional-peer mock is registered, so
  // `no-require-imports` is relaxed here (and the boundary rules don't apply).
  {
    files: ['__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
