import ts from 'typescript-eslint';
export default [
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { parser: ts.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      'no-debugger': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-constant-binary-expression': 'error',
      'no-unsafe-finally': 'error',
    },
  },
];
