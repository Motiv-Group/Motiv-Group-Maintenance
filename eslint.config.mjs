import next from 'eslint-config-next/core-web-vitals'

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
    // eslint-config-next@16 newly bundles the React Compiler rule family. These
    // did not run under the previous `next lint` (eslint 8), so they flag many
    // pre-existing patterns. Keep them as warnings for visibility rather than
    // failing the upgrade on them — adopting/fixing them is tracked separately
    // (PATH_TO_9.5 B16), not part of the Next 16 dependency bump.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
]

export default config
