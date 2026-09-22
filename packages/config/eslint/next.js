module.exports = {
  extends: ['./index.js', 'next/core-web-vitals'],
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  rules: {
    // React/Next.js specific rules
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Next.js specific
    '@next/next/no-html-link-for-pages': 'error',

    // Allow console in client-side code for debugging
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
  overrides: [
    {
      files: ['*.tsx', '*.jsx'],
      rules: {
        // TypeScript handles prop validation
        'react/prop-types': 'off',
      },
    },
  ],
};
