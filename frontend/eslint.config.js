import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

// ESLint 9 flat config. `.eslintrc`, `extends` and `env` belong to the old
// system and are simply not read.
export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'playwright-report', 'node_modules', 'src/components/ui'],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The API layer is typed end to end; an `any` there is the leak this catches.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  // Build-time tooling runs in Node, not the browser.
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.node },
  },
);
