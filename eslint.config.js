import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist'] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
      },
    },
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/semi': ['error', 'always'],
      '@stylistic/member-delimiter-style': 'error',
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      '@typescript-eslint/max-params': ['error', { max: 5 }],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],
      complexity: ['error', 10],
    },
  },
  {
    files: ['test/**'],
    rules: {
      '@typescript-eslint/require-await': 'off',
      'max-lines-per-function': 'off',
    },
  },
);
