import expoConfig from 'eslint-config-expo/flat.js';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';

export default [
  ...expoConfig,
  eslintPluginPrettier,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    // ADD THIS BLOCK:
    settings: {
      react: {
        version: '19.1.0',
      },
    },
    rules: {
      'prettier/prettier': 'error',
      'react/react-in-jsx-scope': 'off',
    },
  },
];