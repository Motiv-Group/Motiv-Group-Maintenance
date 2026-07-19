import Link from 'next/link'
import { FilePlus2, ArrowRight } from 'lucide-react'
import { Card } from '@/components/exec/ui'

// The "Report a problem in under 60 seconds" hero banner. Shared by the Store
// Manager and Individual dashboards; the 3 step chips + copy + destination are
// passed in. Server-safe (no hooks).
export function QuickLogBanner({
  href, title, subtitle, ctaLabel = 'Start Quick Log', steps,
}: {
  href: string
  title: string
  subtitle: string
  ctaLabel?: string
  steps: [string, string, string]
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-5 px-5 py-5 md:grid-cols-[1fr_auto] md:items-center lg:px-8">
        <div className="flex gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-blue-500/40 bg-blue-600/10 text-blue-600 dark:text-blue-300 sm:h-20 sm:w-20">
            <FilePlus2 size={34} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--text)] sm:text-xl">{title}</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
            <div className="mt-5 hidden max-w-xl items-center gap-3 text-xs text-[var(--text-muted)] sm:flex">
              <Step n="1" label={steps[0]} />
              <span className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-slate-500" />
              <Step n="2" label={steps[1]} />
              <span className="h-px flex-1 border-t border-dashed border-slate-300 dark:border-slate-500" />
              <Step n="3" label={steps[2]} />
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-3 md:min-w-[260px]">
          <Link href={href} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500">
            {ctaLabel} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </Card>
  )
}

function Step({ n, label }: { n: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span className="grid h-7 w-7 place-items-center rounded-full border border-blue-500/40 text-xs font-bold text-blue-600 dark:text-blue-300">{n}</span>
      {label}
    </span>
  )
}
