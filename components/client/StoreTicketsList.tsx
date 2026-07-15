'use client'

// Store-manager Tickets tab — the shared RM-style layout (stat cards + filter bar
// + table). The SM manages a single store, so there's no per-store grouping: it
// renders one flat table instead of store-grouped cards.
import { useMemo } from 'react'
import type { StoreManagerTicket } from '@/lib/health/data'
import { clientStatusLabel, clientStatusBadgeClass } from './ticketBadges'
import { TicketTabView, type TabRow, type Intent } from '@/components/ui/TicketTabView'

type Filter = 'all' | 'open' | 'info_requested' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'overdue'

// The SM's next step per raw ticket status. The SM only acts on an info request;
// everything else is driven by the RM / supplier, so it reads as "awaiting".
function smNext(t: StoreManagerTicket): { text: string; act: boolean } {
  switch (t.rawStatus) {
    case 'info_requested': return { text: 'Provide the requested information', act: true }
    case 'open':
    case 'suppliers_declined':
    case 'assigned':
    case 'quote_requested':
    case 'assessment': return { text: t.supplierAssigned ? 'Awaiting supplier quotes' : 'Awaiting quotes', act: false }
    case 'quoted':
    case 'quote_revision': return { text: 'Awaiting quote approval', act: false }
    case 'accepted': return { text: 'Quote approved', act: false }
    case 'scheduled': return { text: 'Supplier visit scheduled', act: false }
    case 'in_progress': return { text: 'Work in progress', act: false }
    case 'submitted_for_signoff':
    case 'pending_sign_off':
    case 'evidence_requested':
    case 'snag':
    case 'snag_assigned':
    case 'snag_in_progress':
    case 'snag_resolved':
    case 'approved_closeout': return { text: 'Awaiting completion sign-off', act: false }
    case 'completed': return { text: 'Completed', act: false }
    case 'cancelled':
    case 'declined': return { text: 'Cancelled', act: false }
    default: return { text: 'Track progress', act: false }
  }
}

function smIntent(t: StoreManagerTicket): Intent {
  if (['completed', 'cancelled', 'declined'].includes(t.rawStatus)) return 'done'
  if (t.rawStatus === 'info_requested') return 'mine'
  return 'awaiting'
}

const SM_STATUS_OPTIONS = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Open' },
  { value: 'open', label: 'New' }, { value: 'info_requested', label: 'Input needed' },
  { value: 'scheduled', label: 'Scheduled' }, { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
]
const STAT_LABELS: Record<Intent, [string, string]> = {
  mine: ['My actions', 'Require your response'],
  awaiting: ['Awaiting action', 'From others'],
  critical: ['SLA breached', 'Require attention'],
  done: ['Completed', 'All resolved'],
}

export function StoreTicketsList({ tickets, initialFilter = 'all', storeName = 'Your store' }: { tickets: StoreManagerTicket[]; initialFilter?: Filter; storeName?: string }) {
  const rows: TabRow[] = useMemo(() => tickets.map(t => {
    const n = smNext(t)
    return {
      id: t.id, href: `/client/tickets/${t.id}`, jobRef: t.jobRef, category: t.category || t.title,
      storeName, branchCode: null,
      priority: String(t.priority), statusLabel: clientStatusLabel(t), statusCls: clientStatusBadgeClass(t),
      nextAction: n.text, nextActionAct: n.act, intent: smIntent(t), bucket: t.status,
      slaDueAt: t.dueAt, overdue: t.overdue, breached: false, createdAt: t.createdAt,
    }
  }), [tickets, storeName])

  return (
    <TicketTabView rows={rows} grouped={false} newHref="/client/tickets/new"
      subtitle="Manage and track your store's tickets."
      statusOptions={SM_STATUS_OPTIONS} statLabels={STAT_LABELS} storageKey="sm-tickets"
      initialFilter={initialFilter === 'all' ? undefined : initialFilter} />
  )
}
