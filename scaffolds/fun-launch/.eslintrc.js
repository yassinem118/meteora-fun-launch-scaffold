module.exports = {
  root: true,
  extends: ['next/core-web-vitals', 'next/typescript', 'prettier'],
  rules: {
    '@typescript-eslint/no-require-imports': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-unsafe-function-type': 'off',
    '@typescript-eslint/no-unsafe-function': 'off',
    '@typescript-eslint/ban-types': 'off',
    'react/no-unescaped-entities': 'off',
    'react-hooks/exhaustive-deps': 'off',
  },
};
