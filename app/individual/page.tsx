export const dynamic = 'force-dynamic'

import { requireIndividual } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { IndividualPriorityWorkQueue, type IndividualJobRow } from '@/components/individual/IndividualPriorityWorkQueue'
import { QuickLogBanner } from '@/components/tickets/QuickLogBanner'
import { chatUnreadCounts } from '@/lib/chat-unread'

export default async function IndividualOverviewPage() {
  const { userId, fullName } = await requireIndividual()
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('tickets')
    .select('id, title, category, status, priority, created_at, supplier_id, job_ref, resolution_due_at, adjusted_resolution_due_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  const tickets = rows ?? []

  // Latest snag schedule_status per ticket — a snag_assigned job whose visit the
  // supplier has PROPOSED needs the owner to accept it (an action, not a wait).
  // Mirrors app/individual/tickets/[id]/page.tsx's snagAwaitingApproval.
  const snagIds = tickets.filter(t => t.status === 'snag_assigned').map(t => t.id)
  // Nullable key/value mirror the snags columns — lookups below only ever use real ids.
  const latestSnagSchedule = new Map<string | null, string | null>()
  if (snagIds.length) {
    const { data: snagRows } = await admin
      .from('snags').select('ticket_id, schedule_status, created_at')
      .in('ticket_id', snagIds).order('created_at', { ascending: false })
    for (const s of snagRows ?? []) if (!latestSnagSchedule.has(s.ticket_id)) latestSnagSchedule.set(s.ticket_id, s.schedule_status)
  }

  // Unread supplier-chat counts — chat exists only once a supplier is awarded.
  const chatUnread = await chatUnreadCounts(admin, userId, tickets.filter(t => t.supplier_id).map(t => t.id))

  const jobs: IndividualJobRow[] = tickets.map(t => ({
    id: t.id,
    title: t.title,
    category: t.category ?? null,
    status: t.status,
    priority: String(t.priority),
    createdAt: t.created_at,
    supplierAssigned: !!t.supplier_id,
    jobRef: t.job_ref ?? null,
    dueAt: t.adjusted_resolution_due_at ?? t.resolution_due_at ?? null,
    snagAwaitingAccept: t.status === 'snag_assigned' && latestSnagSchedule.get(t.id) === 'proposed',
  }))

  const greeting = (() => { const x = new Date().getHours(); return x < 12 ? 'Good morning' : x < 17 ? 'Good afternoon' : 'Good evening' })()

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">Your maintenance jobs — logged, quoted and signed off in one place.</p>
      </div>

      <QuickLogBanner
        href="/individual/tickets/new"
        title="Report a problem in under 60 seconds"
        subtitle="Tell us what’s wrong at home — we’ll take it from there."
        steps={['Describe the issue', 'Add photos', 'Review & send']}
      />

      <IndividualPriorityWorkQueue jobs={jobs} generatedAt={new Date().toISOString()} chatUnread={chatUnread} />
    </div>
  )
}
