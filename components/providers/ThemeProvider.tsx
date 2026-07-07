'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'light', toggle: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initial = stored ?? (prefersDark ? 'dark' : 'light')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only init from localStorage + matchMedia(prefers-color-scheme); cannot run during SSR render
    setTheme(initial)
    // eslint-disable-next-line react-hooks/immutability -- applyTheme mutates document.documentElement (classList/style.colorScheme), an external DOM node not owned by React; this is an intentional post-mount side effect, not component-state mutation
    applyTheme(initial)
    setMounted(true)
  }, [])

  function applyTheme(t: Theme) {
    const root = document.documentElement
    if (t === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    // Explicitly set color-scheme so Samsung Chrome's "Force Dark" feature
    // respects the user's chosen theme and doesn't re-invert colours.
    root.style.colorScheme = t
  }

  function toggle() {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('theme', next)
      applyTheme(next)
      return next
    })
  }

  // Prevent flash: inject a blocking script via dangerouslySetInnerHTML in layout instead.
  // Until mounted, render children without visibility so layout isn't blocked.
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
