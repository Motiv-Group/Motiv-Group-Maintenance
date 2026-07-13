import { type LucideIcon } from 'lucide-react'

// Shared per-section page header for the Settings routes.
export function SettingsHeader({ title, subtitle, Icon }: { title: string; subtitle: string; Icon: LucideIcon }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400"><Icon size={20} /></span>
      <div>
        <h1 className="text-xl font-bold text-[var(--text)]">{title}</h1>
        <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>
    </div>
  )
}
