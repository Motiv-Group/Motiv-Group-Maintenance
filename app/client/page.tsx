export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowRight, CheckCircle2, FilePlus2, ShieldCheck, Sparkles } from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { createAdminClient } from '@/lib/supabase/server'
import { Card, Donut, Pill } from '@/components/exec/ui'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { storeFacts } from '@/lib/briefing/facts'
import { StorePriorityWorkQueue } from '@/components/client/StorePriorityWorkQueue'

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
  const activeTickets = d.tickets.filter(t => t.status !== 'completed' && t.status !== 'cancelled')
  const urgentCount = activeTickets.filter(t => {
    const p = String(t.priority)
    return t.overdue || p === 'urgent' || p === 'P1'
  }).length
  const overdueCount = d.tickets.filter(t => t.overdue).length

  return (
    <div className="space-y-5">
      <header className="min-w-0">
        <h1 className="text-2xl font-bold tracking-normal text-[var(--text)] sm:text-3xl">{greeting}, {firstName(fullName)}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Here&apos;s what&apos;s happening at {d.branch || d.storeName}{d.branchCode ? ` / ${d.branchCode}` : ''}
        </p>
      </header>

      <QuickLogPanel />

      <StorePriorityWorkQueue
        tickets={d.tickets}
        todayVisits={todayVisits}
        storeName={d.branch || d.storeName}
        generatedAt={d.generatedAt}
      />

      <Card className="p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400" /> Store health
          </h2>
          {h && <Pill status={h.finalStatus} label={STATUS_LABELS[h.finalStatus]} />}
        </div>
        {h ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-[110px_1fr]">
            <Donut value={h.finalHealthScore} status={h.finalStatus} size={104} label="Health" />
            <div className="space-y-2">
              <HealthLine label={`${d.open} open tickets`} value={urgentCount ? `${urgentCount} urgent` : 'On track'} tone={urgentCount ? 'bad' : 'good'} />
              <HealthLine label={`${d.inProgress} in progress`} value={d.inProgress ? 'Active' : 'Clear'} tone="good" />
              <HealthLine label={`${overdueCount} overdue today`} value={overdueCount ? 'Needs attention' : 'Great'} tone={overdueCount ? 'bad' : 'good'} />
              <div className="pt-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#C6A35D]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#C6A35D]"><Sparkles size={11} /> AI</span>
                  <BriefingRefresh scope="store" scopeId={briefingScopeId} />
                </div>
                <p className="text-xs leading-relaxed text-[var(--text-muted)]">
                  {briefing?.body ?? 'Keep it up. Your store is running smoothly.'}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState title="Health will appear once store data is available." />
        )}
      </Card>
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

  const list = (tickets ?? []) as any[]
  const supplierIds = Array.from(new Set(list.map(t => t.supplier_id).filter(Boolean)))
  const { data: suppliers } = supplierIds.length
    ? await admin.from('suppliers').select('id, company_name').in('id', supplierIds)
    : { data: [] as any[] }
  const supplierName = new Map((suppliers ?? []).map((s: any) => [s.id, s.company_name]))

  return list.map(t => ({
    id: t.id,
    title: t.title ?? 'Scheduled visit',
    supplier: supplierName.get(t.supplier_id) ?? 'Assigned supplier',
    scheduledAt: t.scheduled_at,
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

function QuickLogPanel() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-5 px-5 py-5 md:grid-cols-[1fr_auto] md:items-center lg:px-8">
        <div className="flex gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-blue-500/40 bg-blue-600/10 text-blue-600 dark:text-blue-300 sm:h-20 sm:w-20">
            <FilePlus2 size={34} />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-[var(--text)] sm:text-xl">Report a problem in under 60 seconds</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Choose issue, add a photo, and submit. We&apos;ll take it from there.</p>
            <div className="mt-5 hidden max-w-xl items-center gap-3 text-xs text-[var(--text-muted)] sm:flex">
              <Step n="1" label="Choose issue" />
              <span className="h-px flex-1 border-t border-dashed border-[var(--border)]" />
              <Step n="2" label="Add photo" />
              <span className="h-px flex-1 border-t border-dashed border-[var(--border)]" />
              <Step n="3" label="Submit" />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:min-w-[260px]">
          <Link href="/client/tickets/new" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-500">
            Start Quick Log <ArrowRight size={16} />
          </Link>
          <Link href="/client/tickets" className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-blue-600 hover:underline dark:text-blue-400">
            View all tickets <ArrowRight size={15} />
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

function HealthLine({ label, value, tone }: { label: string; value: string; tone: 'good' | 'bad' }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-2 text-xs last:border-0">
      <span className="flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
        <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
        <span className="truncate">{label}</span>
      </span>
      <span className={`shrink-0 font-semibold ${tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{value}</span>
    </div>
  )
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] || 'there'
}
