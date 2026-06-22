import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactRefresh.configs.vite,
    ],
    // eslint-plugin-react-hooks v7's `recommended-latest` ships as a legacy
    // (plugins-as-array) config, which ESLint 10 flat config rejects. Register
    // the plugin directly and keep the two classic rules so behavior matches the
    // pre-upgrade config (v7's flat recommended adds many new React-Compiler
    // error rules — an opt-in beyond a dependency bump).
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
])
