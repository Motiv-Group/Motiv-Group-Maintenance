'use client'

import { useTheme } from '@/components/providers/ThemeProvider'
import { Palette, Sun, Moon } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { SettingsHeader } from '@/components/settings/SettingsHeader'

export default function AppearanceSettingsPage() {
  const { theme, toggle } = useTheme()
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <SettingsHeader title="Appearance" subtitle="Light or dark — your call." Icon={Palette} />
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
            {theme === 'dark' ? <Sun size={16} className="text-[#C6A35D]" /> : <Moon size={16} className="text-[#C6A35D]" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </Card>
    </div>
  )
}
