import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.output/**', '**/.output-test/**', '**/.wxt/**', '**/dist/**', 'tools/harness/.profiles/**', 'tools/harness/player/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { chrome: 'readonly', window: 'readonly', document: 'readonly', navigator: 'readonly', console: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', performance: 'readonly', crypto: 'readonly', process: 'readonly', Buffer: 'readonly', WebSocket: 'readonly', RTCPeerConnection: 'readonly', MediaStream: 'readonly', AudioContext: 'readonly', Audio: 'readonly', HTMLMediaElement: 'readonly', MutationObserver: 'readonly', URL: 'readonly', location: 'readonly', history: 'readonly', getComputedStyle: 'readonly', globalThis: 'readonly' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
);
