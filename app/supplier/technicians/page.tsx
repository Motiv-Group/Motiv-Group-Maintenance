export const dynamic = 'force-dynamic'

import { requireSupplierV3 } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { FieldTeamManager, type FieldTeamMember } from '@/components/supplier/FieldTeamManager'

// Jobs a member is still actively working (not yet signed off complete).
const ACTIVE = new Set(['accepted', 'scheduled', 'in_progress', 'snag', 'snag_assigned', 'snag_in_progress', 'snag_resolved', 'pending_sign_off', 'submitted_for_signoff', 'evidence_requested'])
// Jobs finished and signed off.
const COMPLETED = new Set(['completed', 'approved_closeout'])

type TechRow = { id: string; name: string; phone: string }
type TicketRow = { technician_id: string | null; status: string; title: string | null; job_ref: string | null; scheduled_at: string | null }

export default async function SupplierFieldTeamPage() {
  const { supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()

  const { data: techs } = supplierIds.length
    ? await admin.from('technicians').select('id, name, phone').in('supplier_id', supplierIds).eq('active', true).order('name')
    : { data: [] as TechRow[] }
  const techList = (techs ?? []) as TechRow[]
  const techIds = techList.map(t => t.id)

  // Every ticket assigned to one of this supplier's technicians → per-member stats.
  const { data: tks } = techIds.length
    ? await admin.from('tickets').select('technician_id, status, title, job_ref, scheduled_at').in('technician_id', techIds)
    : { data: [] as TicketRow[] }
  const tickets = (tks ?? []) as TicketRow[]

  const byTech = new Map<string, TicketRow[]>()
  for (const tk of tickets) {
    if (!tk.technician_id) continue
    const arr = byTech.get(tk.technician_id) ?? []
    arr.push(tk)
    byTech.set(tk.technician_id, arr)
  }

  const members: FieldTeamMember[] = techList.map(t => {
    const rows = byTech.get(t.id) ?? []
    const active = rows.filter(r => ACTIVE.has(r.status))
    const completed = rows.filter(r => COMPLETED.has(r.status))
    // Current job = the soonest-scheduled active job (unscheduled sort last).
    const current = [...active].sort((a, b) => {
      const av = a.scheduled_at ? new Date(a.scheduled_at).getTime() : Number.POSITIVE_INFINITY
      const bv = b.scheduled_at ? new Date(b.scheduled_at).getTime() : Number.POSITIVE_INFINITY
      return av - bv
    })[0]
    return {
      id: t.id,
      name: t.name,
      phone: t.phone,
      activeJobs: active.length,
      completedJobs: completed.length,
      totalJobs: rows.length,
      currentJob: current ? { title: current.title ?? 'Job', jobRef: current.job_ref, scheduledAt: current.scheduled_at } : null,
    }
  })

  return <FieldTeamManager members={members} />
}
