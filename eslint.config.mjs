import next from 'eslint-config-next/core-web-vitals'
import tsPlugin from '@typescript-eslint/eslint-plugin'

// ESLint 9 flat config. Next 16 removed the `next lint` command, so we run the
// ESLint CLI directly (`eslint .`). eslint-config-next@16 ships a native flat
// config array, so we spread it in — no FlatCompat shim needed.
//
// Flat config does NOT walk up into ancestor .eslintrc files, so a stray legacy
// config outside the repo can no longer double-register the @next/next plugin.
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'android/**', 'out/**', 'next-env.d.ts', 'public/**'] },
  ...next,
  {
    // Register the plugin for the TS3 rule below (transitive dep of
    // eslint-config-next, so no new package). Files scoped to TS only.
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { '@typescript-eslint': tsPlugin },
    // eslint-config-next@16 bundles the React Compiler rule family. The ~37
    // pre-existing hits were triaged and grandfathered with justified inline
    // `eslint-disable-next-line` comments (B16); these rules are now `error` so
    // NEW violations are caught. (The React Compiler itself is not enabled — the
    // rules are advisory — but enforcing them keeps future code compiler-ready.)
    rules: {
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/incompatible-library': 'error',
      'react-hooks/preserve-manual-memoization': 'error',
      // TS3 (2026-07-17 audit): freeze the `any` count. `warn` (not error) so the
      // remaining grandfathered escapes don't block CI, but every new one shows
      // up in review output. Burn down toward zero; flip to 'error' when clean.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]

export default config
