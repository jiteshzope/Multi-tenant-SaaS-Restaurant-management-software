// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * ESLint 9 flat config. `.eslintrc`, `extends` and `env` belong to the old
 * system and are simply not read.
 *
 * This matches the frontend's config in shape and majors so one repo does not
 * run two different linters, with the differences a Nest backend actually
 * needs: Node globals rather than browser ones, and type-aware rules, because
 * the whole point of the strict-TS contract here is catching an `any` that has
 * leaked out of a `$queryRaw` before it reaches a response body.
 *
 * The file is `.mjs` on purpose. This package is CommonJS — Nest compiles to
 * CJS and `"type": "module"` would break the build — but flat config is ESM, so
 * the extension is what tells Node how to read it.
 */
export default tseslint.config(
  {
    ignores: ['dist', 'coverage', 'node_modules', 'prisma/migrations'],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // An `any` in the API layer is the leak this catches.
      '@typescript-eslint/no-explicit-any': 'error',
      // Nest's DI writes `constructor(private readonly x: X) {}` everywhere.
      'no-useless-constructor': 'off',
      '@typescript-eslint/no-useless-constructor': 'off',
    },
  },
  {
    // This file and any other plain JS is outside the TS project, so the
    // type-aware rules have no program to ask and would crash on it.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // Unit specs live beside their subject in src/; test/ is where the e2e
    // suite will land.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', 'test/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // Test doubles legitimately lie about their shape.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);
