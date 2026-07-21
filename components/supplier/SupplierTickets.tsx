'use client'

// Supplier Tickets tab — the shared RM-style layout (stat cards + filter bar +
// store-grouped tables), fed by the supplier's own isolated ticket state, plus a
// rich per-store overview panel (SLA donut, quote/evidence rates).
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Store } from 'lucide-react'
import type { SupplierTicketRow, SupplierQuoteRow } from '@/lib/health/data'
import { Donut } from '@/components/exec/ui'
import { CategoryIcon, priorityBadgeClass, priorityLabel } from '@/components/client/ticketBadges'
import { Modal } from '@/components/ui/Modal'
import { DrawerHeader } from '@/components/exec/Drawer'
import { TicketTabView, type TabRow, type Intent } from '@/components/ui/TicketTabView'
import { supplierStatusMeta, formatDateTime, humanizeDuration } from '@/lib/utils'

type Bucket = 'to_quote' | 'quoted' | 'approved' | 'scheduled' | 'in_progress' | 'signoff' | 'completed' | 'closed'
function bucketOf(s: string): Bucket {
  if (['open', 'info_requested', 'assigned', 'assessment', 'quote_requested', 'quote_revision'].includes(s)) return 'to_quote'
  if (['quoted', 'variation_review'].includes(s)) return 'quoted'
  if (s === 'accepted') return 'approved'
  if (['scheduled', 'vo_declined'].includes(s)) return 'scheduled'
  if (['in_progress', 'variation_accepted'].includes(s)) return 'in_progress'
  if (['submitted_for_signoff', 'evidence_requested', 'snag', 'snag_assigned', 'snag_resolved', 'approved_closeout', 'pending_sign_off', 'snag_in_progress'].includes(s)) return 'signoff'
  if (s === 'completed') return 'completed'
  return 'closed'   // declined / cancelled
}
const BUCKET_LABEL: Record<Bucket, string> = { to_quote: 'Quote requested', quoted: 'Quoted', approved: 'Quote approved', scheduled: 'Job scheduled', in_progress: 'In Progress', signoff: 'Sign-off', completed: 'Completed', closed: 'Closed' }
const BUCKET_BAR: Record<Bucket, string> = { to_quote: 'bg-amber-500', quoted: 'bg-blue-500', approved: 'bg-blue-500', scheduled: 'bg-blue-500', in_progress: 'bg-blue-500', signoff: 'bg-blue-500', completed: 'bg-emerald-500', closed: 'bg-gray-500' }
const BAR_ORDER: Bucket[] = ['to_quote', 'quoted', 'approved', 'scheduled', 'in_progress', 'signoff', 'completed']

// Isolation: the status THIS supplier should see — until awarded they only see
// their own quote state, never another supplier's progress.
function myStatus(t: SupplierTicketRow): string {
  if (t.awardedToMe || t.declinedForMe) return t.status
  return t.quotedByMe ? 'quoted' : 'quote_requested'
}
const bucketOfRow = (t: SupplierTicketRow) => bucketOf(myStatus(t))

// Active tickets where the supplier still owes the after photos + COC.
const missingEvidence = (t: SupplierTicketRow) => t.active && t.evidenceRequired && !(t.afterUploaded && t.cocUploaded)

// Whether this supplier must act next (drives the "My actions" count + emphasis).
function supplierAct(t: SupplierTicketRow): boolean {
  const s = myStatus(t)
  if (s === 'quote_requested') return true
  if (s === 'quoted') return false
  // Once the supplier confirms no further VOs, the close-out is the RM's move.
  if (['approved_closeout', 'vo_declined'].includes(t.status) && t.voNoneConfirmed) return false
  if (t.awardedToMe && ['accepted', 'scheduled', 'in_progress', 'evidence_requested', 'snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved', 'approved_closeout', 'vo_declined'].includes(t.status)) return true
  if (t.status === 'submitted_for_signoff') return false
  return missingEvidence(t)
}

// The supplier's next step per ticket status — short and phase-aware.
function supplierNext(t: SupplierTicketRow): string {
  if (t.disputed) return 'Resolve the dispute'
  const s = myStatus(t)
  if (s === 'quote_requested') return 'Submit a quote'
  if (s === 'quoted') return "Awaiting the client's decision"
  if (['accepted', 'scheduled'].includes(t.status)) return 'Mark the job in progress'
  if (t.status === 'in_progress') return 'Upload the COC & POC'
  if (t.status === 'evidence_requested') return 'Add the requested evidence'
  if (['snag', 'snag_assigned'].includes(t.status)) return 'Accept & schedule the snag fix'
  if (['snag_in_progress', 'snag_resolved'].includes(t.status)) return 'Re-upload the COC & POC'
  if (t.status === 'submitted_for_signoff') return 'Awaiting sign-off'
  if (['approved_closeout', 'vo_declined'].includes(t.status)) return t.voNoneConfirmed ? "Awaiting the client's close-out" : 'Raise or confirm variation orders'
  if (t.status === 'completed') return 'Completed'
  if (t.declinedForMe) return 'Declined'
  if (t.status === 'cancelled') return 'Cancelled'
  return 'Track progress'
}

function supplierIntent(t: SupplierTicketRow): Intent {
  const b = bucketOfRow(t)
  if (t.declinedForMe || t.status === 'cancelled' || b === 'completed' || b === 'closed') return 'done'
  return supplierAct(t) ? 'mine' : 'awaiting'
}

const SUPPLIER_STATUS_OPTIONS = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Open' },
  { value: 'to_quote', label: 'Quote requested' }, { value: 'quoted', label: 'Quoted' },
  { value: 'approved', label: 'Quote approved' }, { value: 'scheduled', label: 'Job scheduled' },
  { value: 'in_progress', label: 'In progress' }, { value: 'signoff', label: 'Sign-off' },
  { value: 'completed', label: 'Completed' },
]
const STAT_LABELS: Record<Intent, [string, string]> = {
  mine: ['My actions', 'Require your response'],
  awaiting: ['Awaiting action', 'From others'],
  critical: ['At SLA breach and overdue', 'Require attention'],
  done: ['Completed and closed', 'All resolved'],
}

export function SupplierTickets({ tickets, quotes, company }: { tickets: SupplierTicketRow[]; quotes: SupplierQuoteRow[]; company: string }) {
  const [panelStore, setPanelStore] = useState<string | null>(null)

  const rows: TabRow[] = useMemo(() => tickets.map(t => {
    const sm = supplierStatusMeta(myStatus(t))
    const statusCls = t.declinedForMe || t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls
    const statusLabel = t.disputed ? 'Dispute' : t.declinedForMe ? (t.declinedBy === 'supplier' ? 'Declined (you)' : t.declinedBy === 'regional_manager' ? 'Declined (Client)' : 'Declined') : sm.label
    return {
      id: t.id, href: `/supplier/tickets/${t.id}`, jobRef: t.jobRef, category: t.category || t.title,
      storeName: t.isIndividual ? 'Individual' : t.storeName, branchCode: t.branchCode,
      priority: String(t.priority), statusLabel, statusCls,
      nextAction: supplierNext(t), nextActionAct: supplierAct(t), intent: supplierIntent(t), bucket: bucketOfRow(t),
      slaDueAt: t.nextActionDueAt ?? t.dueAt, overdue: t.overdue, breached: t.breached, createdAt: t.createdAt,
    }
  }), [tickets])

  const storeOf = (t: SupplierTicketRow) => t.isIndividual ? 'Individual' : t.storeName
  const panelRows = useMemo(() => panelStore ? tickets.filter(t => storeOf(t) === panelStore) : [], [tickets, panelStore])
  const panelQuotes = useMemo(() => panelStore ? quotes.filter(qq => qq.storeName === panelStore) : [], [quotes, panelStore])

  return (
    <>
      <TicketTabView rows={rows} grouped subtitle="Manage and track your assigned jobs across all stores."
        statusOptions={SUPPLIER_STATUS_OPTIONS} statLabels={STAT_LABELS} storageKey="supplier-tickets" onStoreOverview={setPanelStore} />
      {panelStore && <StorePanel store={panelStore} company={company} rows={panelRows} quotes={panelQuotes} onClose={() => setPanelStore(null)} />}
    </>
  )
}

// Simple ticket row used inside the store-overview panel's ticket list.
function PanelRow({ t }: { t: SupplierTicketRow }) {
  const sm = supplierStatusMeta(myStatus(t))
  const statusCls = t.declinedForMe || t.disputed ? 'bg-red-500/15 text-red-700 dark:text-red-400' : sm.cls
  const statusLabel = t.disputed ? 'Dispute' : t.declinedForMe ? 'Declined' : sm.label
  // eslint-disable-next-line react-hooks/purity -- cosmetic "overdue by" elapsed readout; not hydration-critical
  const overdueBy = t.overdue ? humanizeDuration(Date.now() - new Date(t.dueAt).getTime()) : null
  return (
    <Link href={`/supplier/tickets/${t.id}`} className="grid gap-3 border-b border-[var(--border)] px-2 py-3 last:border-0 transition hover:bg-[var(--hover)] sm:grid-cols-[1fr_auto] sm:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <CategoryIcon category={t.category ?? t.title} priority={t.priority} className="h-11 w-11" iconSize={18} />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-[var(--text)]">{t.title}</p>
          <p className="text-sm text-[var(--text-muted)]">{formatDateTime(t.createdAt)}{overdueBy && <span className="ml-1.5 font-semibold text-red-600 dark:text-red-400">· Overdue by {overdueBy}</span>}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
        <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${priorityBadgeClass(t as never)}`}>{priorityLabel(t as never)}</span>
        <span className={`inline-flex w-[120px] justify-center whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold ${statusCls}`}>{statusLabel}</span>
      </div>
    </Link>
  )
}

function StorePanel({ store, company, rows, quotes, onClose }: { store: string; company?: string; rows: SupplierTicketRow[]; quotes: SupplierQuoteRow[]; onClose: () => void }) {
  const c: Record<Bucket, number> = { to_quote: 0, quoted: 0, approved: 0, scheduled: 0, in_progress: 0, signoff: 0, completed: 0, closed: 0 }
  for (const t of rows) c[bucketOfRow(t)]++
  const total = rows.length
  const panelIndividual = rows[0]?.isIndividual ?? false
  const barTotal = BAR_ORDER.reduce((s, b) => s + c[b], 0) || 1
  const active = rows.filter(t => t.active)
  const overdue = active.filter(t => t.breached).length
  const slaScore = active.length ? Math.round(100 * (active.length - overdue) / active.length) : 100
  const slaState = slaScore >= 80 ? 'controlled' : slaScore >= 60 ? 'attention' : slaScore >= 40 ? 'at_risk' : 'critical'
  const decided = quotes.filter(qq => qq.status === 'accepted' || qq.status === 'declined')
  const acceptRate = decided.length ? Math.round(100 * decided.filter(qq => qq.status === 'accepted').length / decided.length) : null
  const evReq = active.filter(t => t.evidenceRequired)
  const evRate = evReq.length ? Math.round(100 * evReq.filter(t => t.afterUploaded && t.cocUploaded).length / evReq.length) : null

  const Stat = ({ label, value }: { label: string; value: number | string }) => (
    <div className="rounded-xl bg-[var(--surface)] p-3 ring-1 ring-[var(--border)]"><div className="text-xl font-bold text-[var(--text)]">{value}</div><div className="text-xs text-[var(--text-muted)]">{label}</div></div>
  )

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      {close => (
        <>
          <DrawerHeader onClose={close} title={
            <div className="min-w-0">
              {company && !panelIndividual && <p className="truncate text-[10px] text-[var(--text-faint)]">{company}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Store size={18} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-lg font-bold text-[var(--text)]">{store}</h3>
                <span className="text-xs text-[var(--text-muted)]">{total} ticket{total === 1 ? '' : 's'}</span>
              </div>
            </div>
          } />

          <div className="flex items-center gap-4">
            <Donut value={slaScore} status={slaState} size={96} label="SLA" />
            <div className="space-y-0.5 text-xs text-[var(--text-muted)]">
              <p><span className="font-semibold text-[var(--text)]">{active.length}</span> active · <span className={overdue ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--text)]'}>{overdue}</span> overdue</p>
              {acceptRate != null && <p>Quote acceptance <span className="font-semibold text-[var(--text)]">{acceptRate}%</span></p>}
              {evRate != null && <p>Evidence complete <span className="font-semibold text-[var(--text)]">{evRate}%</span></p>}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
              {BAR_ORDER.map(b => c[b] > 0 && <div key={b} className={`h-full ${BUCKET_BAR[b]}`} style={{ width: `${Math.round((c[b] / barTotal) * 100)}%` }} />)}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
              {([...BAR_ORDER, 'closed'] as Bucket[]).map(b => c[b] > 0 && <span key={b} className="flex items-center gap-1.5 text-[var(--text-muted)]"><i className={`h-2 w-2 rounded-full ${BUCKET_BAR[b]}`} />{BUCKET_LABEL[b]} {c[b]}</span>)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Stat label="To quote / quoted" value={c.to_quote + c.quoted} />
            <Stat label="In progress" value={c.approved + c.scheduled + c.in_progress} />
            <Stat label="Sign-off" value={c.signoff} />
            <Stat label="Completed" value={c.completed} />
          </div>

          <div>
            <div className="mb-1 text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Tickets</div>
            {rows.map(t => <PanelRow key={t.id} t={t} />)}
          </div>
        </>
      )}
    </Modal>
  )
}
