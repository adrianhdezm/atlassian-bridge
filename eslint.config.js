import js from '@eslint/js';
import pluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  {
    ignores: ['**/.cache/**', '**/node_modules/**', '**/dist/**', '**/*.json', '**/coverage/**', '**/*.tsbuildinfo', 'eslint.config.js']
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,jsx,tsx}'],
    plugins: { js },
    extends: ['js/recommended'],
    languageOptions: {
      globals: { ...globals.node }
    }
  },
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [],
          defaultProject: 'tsconfig.json'
        },
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module'
      }
    }
  },
  pluginPrettierRecommended,
  {
    rules: {
      curly: 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true
        }
      ]
    }
  }
]);
