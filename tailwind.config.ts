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
          // 50–400 = warm gold/cream accent. 500–900 = the app chrome (neutral
          // warm-charcoal; 600 is the nav / login / splash surface). The actual
          // colours live as RGB-channel CSS vars in globals.css (defaults) so the
          // admin Customize tab can override them at runtime — the channel form
          // keeps Tailwind opacity modifiers (brand-900/20) working. Factory hex
          // values are mirrored in lib/settings.ts BRAND_DEFAULT_HEX.
          50:  'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
export default config
