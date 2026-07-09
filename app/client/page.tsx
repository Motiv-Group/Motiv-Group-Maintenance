export const dynamic = 'force-dynamic'

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Droplets,
  FilePlus2,
  Info,
  Loader2,
  PlusCircle,
  ShieldCheck,
  Snowflake,
  Sparkles,
  Wrench,
  Zap,
} from 'lucide-react'
import { requireStoreManagerV3 } from '@/lib/health/guard'
import { assembleStoreManagerDashboard, type StoreManagerTicket } from '@/lib/health/data'
import { STATUS_LABELS } from '@/lib/health/constants'
import { createAdminClient } from '@/lib/supabase/server'
import { Card, Donut, Pill } from '@/components/exec/ui'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { storeFacts } from '@/lib/briefing/facts'
import { formatDate, formatDateTime, humanizeDuration, PRIORITY_LEVEL_LABELS } from '@/lib/utils'

type TodayVisit = {
  id: string
  title: string
  supplier: string
  scheduledAt: string
  proposed: boolean
}

const ACTIVE_STATUSES = new Set(['open', 'info_requested', 'scheduled', 'in_progress'])
const URGENCY_RANK: Record<string, number> = { urgent: 0, P1: 0, high: 1, P2: 1, medium: 2, P3: 2, low: 3, P4: 3 }

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
  const urgentCount = activeTickets.filter(t => isUrgent(t)).length
  const overdueCount = d.tickets.filter(t => t.overdue).length
  const inputTickets = d.tickets.filter(t => t.status === 'info_requested').sort(byNewest).slice(0, 2)
  const completedTickets = d.tickets.filter(t => t.status === 'completed').sort(byNewest).slice(0, 3)
  const focusTickets = [...activeTickets].sort(byFocus).slice(0, 4)
  const generatedAtMs = new Date(d.generatedAt).getTime()

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-normal text-[var(--text)] sm:text-3xl">{greeting}, {firstName(fullName)}</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Here&apos;s what&apos;s happening at {d.branch || d.storeName}{d.branchCode ? ` / ${d.branchCode}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 md:flex-col md:items-end">
          <Link href="/client/tickets/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-950/20 transition hover:bg-blue-500">
            <PlusCircle size={17} /> Log New Issue
          </Link>
          <span className="hidden rounded-full bg-[var(--surface)] px-3 py-1 text-[11px] font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)] md:inline-flex">
            {formatDate(d.generatedAt)}
          </span>
        </div>
      </header>

      <QuickLogPanel />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<CircleAlert size={21} />}
          tone="red"
          label="Open Tickets"
          value={d.open}
          sub={`${urgentCount} urgent`}
          href="/client/tickets?status=open"
        />
        <MetricCard
          icon={<CalendarClock size={21} />}
          tone="purple"
          label="Supplier Coming Today"
          value={todayVisits.length}
          sub={todayVisits.length ? `${todayVisits.length} visit${todayVisits.length === 1 ? '' : 's'} booked` : 'No visits booked'}
          href="/client/visits"
        />
        <MetricCard
          icon={<Info size={21} />}
          tone="gold"
          label="Needs Your Input"
          value={d.awaitingInput}
          sub={d.awaitingInput === 1 ? '1 job to update' : `${d.awaitingInput} jobs to update`}
          href="/client/tickets?status=info_requested"
        />
        <MetricCard
          icon={<Loader2 size={21} />}
          tone="green"
          label="In Progress"
          value={d.inProgress}
          sub="Being worked on"
          href="/client/tickets?status=in_progress"
        />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.95fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <AlertTriangle size={16} className="text-red-500" /> Urgent & Open Tickets
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">The items that need attention first</p>
            </div>
            <Link href="/client/tickets" className="hidden items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400 sm:flex">
              View all <ArrowRight size={13} />
            </Link>
          </div>
          <div className="px-4 py-3">
            {focusTickets.length ? focusTickets.map(t => <FocusTicketRow key={t.id} ticket={t} nowMs={generatedAtMs} />) : (
              <EmptyState icon={<ShieldCheck size={28} />} title="No open work" body="Everything is clear right now." />
            )}
          </div>
          <div className="border-t border-[var(--border)] px-5 py-3">
            <Link href="/client/tickets" className="inline-flex items-center gap-2 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
              View all tickets <ArrowRight size={13} />
            </Link>
          </div>
        </Card>

        <div className="grid gap-5">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
              <CalendarClock size={16} className="text-purple-600 dark:text-purple-400" /> Today at your store
            </h2>
            <p className="mt-4 text-xs font-semibold text-[var(--text-muted)]">Supplier coming today</p>
            <div className="mt-3 space-y-2">
              {todayVisits.length ? todayVisits.map(v => (
                <Link key={v.id} href={`/client/tickets/${v.id}`} className="flex items-center gap-3 rounded-xl border border-[var(--border)] px-3 py-3 transition hover:bg-[var(--hover)]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-300"><CalendarClock size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{v.supplier}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">{v.title}</span>
                    <span className="block text-[11px] text-[var(--text-faint)]">{formatDateTime(v.scheduledAt)}{v.proposed ? ' / proposed' : ''}</span>
                  </span>
                </Link>
              )) : (
                <EmptyState icon={<CalendarClock size={30} />} title="No supplier visits booked for today." />
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
                <Info size={16} className="text-[#C6A35D]" /> Awaiting your input
              </h2>
              <Link href="/client/tickets?status=info_requested" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">View all</Link>
            </div>
            <div className="mt-4 space-y-2">
              {inputTickets.length ? inputTickets.map(t => (
                <Link key={t.id} href={`/client/tickets/${t.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-3 transition hover:bg-[var(--hover)]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[var(--text)]">{t.title}</span>
                    <span className="block text-xs text-[var(--text-muted)]">Information requested</span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white">Add info</span>
                </Link>
              )) : (
                <EmptyState icon={<CheckCircle2 size={28} />} title="Nothing waiting on you." />
              )}
            </div>
          </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.95fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
              <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400" /> Recently completed
            </h2>
            <Link href="/client/tickets?status=completed" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">View all</Link>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {completedTickets.length ? completedTickets.map(t => (
              <Link key={t.id} href={`/client/tickets/${t.id}`} className="min-w-0 border-b border-[var(--border)] pb-3 last:border-0 md:border-b-0 md:border-r md:pb-0 md:pr-3 md:last:border-r-0">
                <div className="flex items-center gap-2">
                  <CategoryIcon category={t.category ?? t.title} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[var(--text)]">{t.category || 'Job'}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{t.title}</p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--text-faint)]">Completed {formatDateTime(t.createdAt)}</p>
              </Link>
            )) : (
              <div className="md:col-span-3"><EmptyState icon={<CheckCircle2 size={28} />} title="No completed tickets yet." /></div>
            )}
          </div>
        </Card>

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
            <EmptyState icon={<ShieldCheck size={28} />} title="Health will appear once store data is available." />
          )}
        </Card>
      </section>
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

function MetricCard({
  icon,
  tone,
  label,
  value,
  sub,
  href,
}: {
  icon: React.ReactNode
  tone: 'red' | 'purple' | 'gold' | 'green'
  label: string
  value: number
  sub: string
  href: string
}) {
  const tones = {
    red: 'bg-red-500/15 text-red-600 dark:text-red-300 ring-red-500/20',
    purple: 'bg-purple-500/15 text-purple-600 dark:text-purple-300 ring-purple-500/20',
    gold: 'bg-[#C6A35D]/15 text-amber-700 dark:text-[#C6A35D] ring-[#C6A35D]/20',
    green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20',
  }
  const subColor = tone === 'red' ? 'text-red-600 dark:text-red-400'
    : tone === 'gold' ? 'text-amber-600 dark:text-[#C6A35D]'
    : tone === 'green' ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-[var(--text-muted)]'

  return (
    <Link href={href} className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50">
      <Card className="h-full p-4 transition hover:-translate-y-0.5 hover:ring-blue-500/30">
        <div className="flex items-center gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ring-1 ${tones[tone]}`}>{icon}</span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[var(--text-muted)]">{label}</p>
            <p className="mt-1 text-2xl font-bold leading-none text-[var(--text)]">{value}</p>
            <p className={`mt-1 truncate text-xs font-semibold ${subColor}`}>{sub}</p>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function FocusTicketRow({ ticket, nowMs }: { ticket: StoreManagerTicket; nowMs: number }) {
  const overdueMs = ticket.overdue ? nowMs - new Date(ticket.dueAt).getTime() : 0
  return (
    <Link href={`/client/tickets/${ticket.id}`} className="grid gap-3 rounded-xl px-2 py-3 transition hover:bg-[var(--hover)] sm:grid-cols-[1fr_auto_auto_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={ticket.category ?? ticket.title} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--text)]">{ticket.category || ticket.title}</p>
          <p className="truncate text-xs text-[var(--text-muted)]">{ticket.title}</p>
        </div>
      </div>
      <span className={`w-fit rounded-lg px-2 py-1 text-[11px] font-bold ${ticket.overdue || isUrgent(ticket) ? 'bg-red-500/15 text-red-600 dark:text-red-400' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'}`}>
        {ticket.overdue ? 'Overdue' : PRIORITY_LEVEL_LABELS[ticket.priority] ?? 'Logged'}
      </span>
      <span className="text-xs text-[var(--text-muted)]">{statusCopy(ticket)}</span>
      <span className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)]">
        {ticket.overdue ? `Late ${humanizeDuration(overdueMs)}` : 'View Ticket'}
      </span>
    </Link>
  )
}

function CategoryIcon({ category }: { category?: string | null }) {
  const text = String(category ?? '').toLowerCase()
  const Icon = text.includes('refriger') || text.includes('air') ? Snowflake
    : text.includes('plumb') || text.includes('water') || text.includes('leak') ? Droplets
    : text.includes('electric') || text.includes('power') ? Zap
    : Wrench
  const cls = Icon === Snowflake ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
    : Icon === Droplets ? 'bg-pink-500/15 text-pink-600 dark:text-pink-300'
    : Icon === Zap ? 'bg-blue-500/15 text-blue-600 dark:text-blue-300'
    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
  return <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${cls}`}><Icon size={18} /></span>
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body?: string }) {
  return (
    <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center">
      <div>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]">{icon}</div>
        <p className="text-sm font-semibold text-[var(--text-muted)]">{title}</p>
        {body && <p className="mt-1 text-xs text-[var(--text-faint)]">{body}</p>}
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

function isUrgent(t: StoreManagerTicket): boolean {
  const p = String(t.priority)
  return t.overdue || p === 'urgent' || p === 'P1'
}

function byNewest(a: StoreManagerTicket, b: StoreManagerTicket): number {
  return +new Date(b.createdAt) - +new Date(a.createdAt)
}

function byFocus(a: StoreManagerTicket, b: StoreManagerTicket): number {
  return Number(b.overdue) - Number(a.overdue)
    || (URGENCY_RANK[a.priority] ?? 9) - (URGENCY_RANK[b.priority] ?? 9)
    || byNewest(a, b)
}

function statusCopy(t: StoreManagerTicket): string {
  if (t.overdue) return 'Needs follow-up'
  if (t.status === 'info_requested') return 'Waiting for your update'
  if (t.status === 'scheduled') return 'Supplier booked'
  if (t.status === 'in_progress') return 'Team is working on it'
  if (ACTIVE_STATUSES.has(t.status)) return 'Logged'
  return 'Closed'
}
