// Shared dashboard hero used by the store-manager and regional-manager homes:
// greeting on the left, a health donut + status + AI briefing on the right. The
// status reads as a white scope word ("Store" / "Region") + the coloured status
// (e.g. "Store At Risk"). Health block is optional — omit `status` to show just
// the greeting (e.g. before any health score exists).
import { Sparkles } from 'lucide-react'
import { Donut, STATUS_TEXT } from '@/components/exec/ui'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { STATUS_LABELS } from '@/lib/health/constants'
import type { HealthStatus } from '@/lib/health/types'
import type { BriefingScope } from '@/lib/briefing/facts'

export function DashboardHealthHeader({
  greeting, name, subtitle, scopePrefix,
  score, status, briefingBody, briefingScope, briefingScopeId,
}: {
  greeting: string
  name: string | null
  subtitle: string
  scopePrefix: string
  score?: number
  status?: HealthStatus
  briefingBody?: string | null
  briefingScope?: BriefingScope
  briefingScopeId?: string
}) {
  const first = name?.trim().split(/\s+/)[0] || 'there'
  return (
    <div className="flex flex-col gap-6 py-1 lg:flex-row lg:items-center">
      <div className="min-w-0 lg:w-1/2">
        <h1 className="text-2xl font-bold tracking-normal text-[var(--text)] sm:text-3xl">{greeting}, {first}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</p>
      </div>
      {status && (
        <div className="flex items-center gap-4 lg:flex-1 lg:min-w-0">
          <Donut value={score ?? 0} status={status} size={100} label="Health" />
          <div className="min-w-0 flex-1 border-l border-[var(--border)] pl-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">
                <span className="text-[var(--text)]">{scopePrefix} </span>
                <span className={STATUS_TEXT[status]}>{STATUS_LABELS[status]}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"><Sparkles size={11} className="text-[#C6A35D]" /> AI</span>
              {briefingScope && briefingScopeId && <BriefingRefresh scope={briefingScope} scopeId={briefingScopeId} />}
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
              {briefingBody ?? 'Keep it up — everything is running smoothly.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
