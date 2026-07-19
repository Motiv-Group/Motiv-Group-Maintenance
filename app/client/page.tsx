export const dynamic = 'force-dynamic'

import { ShieldCheck } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { createAdminClient } from '@/lib/supabase/server'
import { Card } from '@/components/exec/ui'
import { DashboardHealthHeader } from '@/components/exec/DashboardHealthHeader'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { storeFacts } from '@/lib/briefing/facts'
import { StorePriorityWorkQueue } from '@/components/client/StorePriorityWorkQueue'
import { QuickLogBanner } from '@/components/tickets/QuickLogBanner'

type TodayVisit = {
  id: string
  title: string
  supplier: string
  scheduledAt: string
  proposed: boolean
}

export default async function StoreOverviewPage() {
  const { companyId, storeIds, fullName } = await requireStoreManagerV3()
  const d = await assembleStoreManagerDashboard(companyId, storeIds)
  const h = d.health
  const briefingScopeId = storeIds.slice().sort().join(',')
  const [briefing, todayVisits] = await Promise.all([
    getDailyBriefing({ companyId, scope: 'store', scopeId: briefingScopeId, role: 'store_manager', facts: storeFacts(d) }),
    loadTodayVisits(storeIds),
  ])
  const greeting = (() => { const x = new Date().getHours(); return x < 12 ? 'Good morning' : x < 17 ? 'Good afternoon' : 'Good evening' })()

  return (
    <div className="space-y-5">
      {/* Page header — greeting (left half) · health donut + AI briefing (right). */}
      <DashboardHealthHeader
        greeting={greeting}
        name={fullName}
        subtitle={`Here's what's happening at ${d.branch || d.storeName}${d.branchCode ? ` / ${d.branchCode}` : ''}`}
        scopePrefix="Store"
        score={h?.finalHealthScore}
        status={h?.finalStatus}
        briefingBody={briefing?.body ?? 'Keep it up. Your store is running smoothly.'}
        briefingHeadline={briefing?.headline}
        briefingScope="store"
        briefingScopeId={h ? briefingScopeId : undefined}
      />

      <QuickLogBanner
        href="/client/tickets/new"
        title="Report a problem in under 60 seconds"
        subtitle="Tell us what’s wrong — we’ll take it from there."
        steps={['Describe the issue', 'Add photos', 'Review & send']}
      />

      <StorePriorityWorkQueue
        tickets={d.tickets}
        todayVisits={todayVisits}
        storeName={d.branch || d.storeName}
        generatedAt={d.generatedAt}
      />
    </div>
  )
}

async function loadTodayVisits(storeIds: string[]): Promise<TodayVisit[]> {
  if (!storeIds.length) return []
  const admin = createAdminClient()
  const { start, end } = saTodayBounds()
  const { data: tickets } = await admin
    .from('tickets')
    .select('id, title, scheduled_at, schedule_status, supplier_id, status')
    .in('store_id', storeIds)
    .gte('scheduled_at', start)
    .lt('scheduled_at', end)
    .in('status', ['scheduled', 'in_progress', 'snag_assigned', 'snag_in_progress'])
    .order('scheduled_at', { ascending: true })

  const list = tickets ?? []
  const supplierIds = Array.from(new Set(list.map(t => t.supplier_id).filter(Boolean))) as string[]
  const { data: suppliers } = supplierIds.length
    ? await admin.from('suppliers').select('id, company_name').in('id', supplierIds)
    : { data: null }
  const supplierName = new Map((suppliers ?? []).map(s => [s.id, s.company_name] as const))

  return list.map(t => ({
    id: t.id,
    title: t.title ?? 'Scheduled visit',
    supplier: supplierName.get(t.supplier_id ?? '') ?? 'Assigned supplier',
    // scheduled_at is never null here (the query range-filters on it) — '' can't occur at runtime.
    scheduledAt: t.scheduled_at ?? '',
    proposed: t.schedule_status === 'proposed',
  }))
}

function saTodayBounds(): { start: string; end: string } {
  const pieces = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const byType = Object.fromEntries(pieces.map(p => [p.type, p.value]))
  const start = new Date(`${byType.year}-${byType.month}-${byType.day}T00:00:00+02:00`)
  return { start: start.toISOString(), end: new Date(start.getTime() + 24 * 60 * 60_000).toISOString() }
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]">
          <ShieldCheck size={24} />
        </div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{title}</p>
      </div>
    </div>
  )
}
