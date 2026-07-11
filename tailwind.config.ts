import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    // STATUS_COLORS / PRIORITY_COLORS live here as literal class strings —
    // must be scanned or Tailwind purges the badge colours.
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Geist is loaded in app/layout.tsx (self-hosted via next/font — CSP-safe).
        // Falls back to the system UI stack until the font paints.
        sans: ['var(--font-geist-sans)', ...defaultTheme.fontFamily.sans],
        mono: ['var(--font-geist-mono)', ...defaultTheme.fontFamily.mono],
      },
      colors: {
        brand: {
          // 50–400 = warm gold/cream accent (kept). 500–900 = the app chrome,
          // retuned from navy to a neutral warm-charcoal so the gradient MOTIV
          // logo reads clean + premium (600 is the nav / login / splash surface).
          50:  '#f8f5ed',
          100: '#e8dfc4',
          300: '#c9b99a',
          400: '#b5a07d',
          500: '#1b1d24',
          600: '#0e1016',
          700: '#090a0e',
          900: '#050608',
        },
      },
    },
  },
  plugins: [],
}
export default config
