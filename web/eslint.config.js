import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      'prefer-const': 'warn',
      // The 400-line ceiling, as editor feedback. scripts/line-ceiling.ps1 is the authority and
      // asserts this number matches its own; web/src/vendor/** is already in `ignores` below.
      // skipBlankLines and skipComments are false, so this counts every line; the script's
      // Measure-FileLines counts the same way, which is the half of "no drift" a shared number
      // does not buy on its own.
      'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
    },
  },
  {
    // src/vendor/** is upstream code kept close to its original; see src/vendor/PATCHES.md.
    ignores: ['dist/**', 'node_modules/**', 'scripts/**', 'src/vendor/**', '*.config.*'],
  }
);
