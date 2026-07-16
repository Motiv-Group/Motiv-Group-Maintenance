export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import { requireIndividual } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { IndividualPriorityWorkQueue, type IndividualJobRow } from '@/components/individual/IndividualPriorityWorkQueue'

export default async function IndividualOverviewPage() {
  const { userId, fullName } = await requireIndividual()
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('tickets')
    .select('id, title, category, status, priority, created_at, supplier_id, job_ref, resolution_due_at, adjusted_resolution_due_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  const tickets = (rows ?? []) as any[]

  // Latest snag schedule_status per ticket — a snag_assigned job whose visit the
  // supplier has PROPOSED needs the owner to accept it (an action, not a wait).
  // Mirrors app/individual/tickets/[id]/page.tsx's snagAwaitingApproval.
  const snagIds = tickets.filter(t => t.status === 'snag_assigned').map(t => t.id)
  const latestSnagSchedule = new Map<string, string>()
  if (snagIds.length) {
    const { data: snagRows } = await admin
      .from('snags').select('ticket_id, schedule_status, created_at')
      .in('ticket_id', snagIds).order('created_at', { ascending: false })
    for (const s of (snagRows ?? []) as any[]) if (!latestSnagSchedule.has(s.ticket_id)) latestSnagSchedule.set(s.ticket_id, s.schedule_status)
  }

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
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-[var(--text)]">{greeting}, {fullName?.split(' ')[0] ?? 'there'} 👋</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Your maintenance jobs — logged, quoted and signed off in one place.</p>
        </div>
        <Link href="/individual/tickets/new" className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500">
          <PlusCircle size={16} /> Log a Job
        </Link>
      </div>

      <IndividualPriorityWorkQueue jobs={jobs} generatedAt={new Date().toISOString()} />
    </div>
  )
}
