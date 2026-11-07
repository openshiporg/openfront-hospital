import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  {
    ignores: [
      '.keystone/**',
      '.next/**',
      'node_modules/**',
      'public/**',
      'schema.graphql',
      'features/dashboard/views/**',
      'features/keystone/view-order/**',
    ],
  },
  {
    // Same file set the Next configs register their plugins for; unscoped, ESLint applies these rules to
    // files where react-hooks is not defined and refuses to lint at all.
    files: ['**/*.{js,jsx,mjs,ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'prefer-const': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    // CommonJS test harnesses load TypeScript sources into a vm sandbox; require() and a local `module` are the point.
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@next/next/no-assign-module-variable': 'off',
    },
  },
]

export default eslintConfig
