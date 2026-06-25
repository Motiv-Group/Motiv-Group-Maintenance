export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireSupplierV3 } from '@/lib/health/guard'
import { SubmitCompletionForm } from '@/components/supplier/SubmitCompletionForm'

export default async function SupplierCompletePage({ params }: { params: { id: string } }) {
  const { companyId, supplierIds } = await requireSupplierV3()
  const admin = createAdminClient()
  const { data: t } = await admin.from('tickets').select('id, company_id, supplier_id, status, title, job_ref').eq('id', params.id).single()
  if (!t || t.company_id !== companyId || !t.supplier_id || !supplierIds.includes(t.supplier_id)) redirect('/supplier/tickets')
  if (!['in_progress', 'snag_resolved', 'evidence_requested'].includes(t.status)) redirect(`/supplier/tickets/${t.id}`)

  return (
    <div className="space-y-5">
      <Link href={`/supplier/tickets/${t.id}`} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to ticket</Link>
      <p className="text-sm text-[var(--text-muted)]">{t.job_ref ? `${t.job_ref} · ` : ''}{t.title}</p>
      <SubmitCompletionForm ticketId={t.id} />
    </div>
  )
}
