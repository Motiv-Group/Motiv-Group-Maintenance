'use client'

import { useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { Palette, Sun, Moon, Monitor } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { SettingsHeader } from '@/components/settings/SettingsHeader'

// Desktop content width — how much of the available width the app fills. Persisted
// in localStorage and applied live + on next load by the blocking script in
// app/layout.tsx. Clamped to a readable range.
const MIN = 70, MAX = 95, DEFAULT = 90

export default function AppearanceSettingsPage() {
  const { theme, toggle } = useTheme()
  const [width, setWidth] = useState<number>(DEFAULT)

  useEffect(() => {
    const stored = parseInt(localStorage.getItem('content-width') ?? '', 10)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads localStorage (client-only) after mount to reflect the saved width
    if (!isNaN(stored)) setWidth(Math.max(MIN, Math.min(MAX, stored)))
  }, [])

  function apply(v: number) {
    const clamped = Math.max(MIN, Math.min(MAX, v))
    setWidth(clamped)
    localStorage.setItem('content-width', String(clamped))
    document.documentElement.style.setProperty('--content-width', clamped + '%')
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <SettingsHeader title="Appearance" subtitle="Theme and layout — your call." Icon={Palette} />

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--text)]">Theme</p>
            <p className="text-xs text-[var(--text-faint)] mt-0.5">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text)] hover:bg-[var(--hover)] transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} className="text-blue-600 dark:text-blue-400" /> : <Moon size={16} className="text-blue-600 dark:text-blue-400" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Monitor size={16} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <div>
              <p className="text-sm text-[var(--text)]">Content width</p>
              <p className="text-xs text-[var(--text-faint)] mt-0.5">How much of the screen the app fills on desktop.</p>
            </div>
          </div>
          <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{width}%</span>
        </div>
        <input
          type="range" min={MIN} max={MAX} step={1} value={width}
          onChange={e => apply(Number(e.target.value))}
          aria-label="Content width"
          className="w-full cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-[11px] text-[var(--text-faint)]">
          <span>{MIN}% · narrow</span><span>Default {DEFAULT}%</span><span>{MAX}% · wide</span>
        </div>
      </Card>
    </div>
  )
}
