export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, PlusCircle } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { RmNewTicketForm } from '@/components/regional/RmNewTicketForm'
import { Card } from '@/components/exec/ui'
import { storeLabel } from '@/lib/utils'

export default async function RegionalNewTicketPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()
  const [{ data: storesRaw }, { data: suppliersRaw }] = await Promise.all([
    admin.from('stores').select('id, name, sub_store').eq('company_id', companyId).in('region_id', regionIds).eq('active', true).is('closed_at', null).order('name'),
    admin.from('suppliers').select('id, company_name').eq('company_id', companyId).eq('active', true).order('company_name'),
  ])
  const stores = ((storesRaw ?? []) as any[]).map(s => ({ id: s.id, name: storeLabel(s.name, s.sub_store) }))
  const suppliers = ((suppliersRaw ?? []) as any[]).map(s => ({ id: s.id, name: s.company_name }))

  return (
    <div className="space-y-5">
      <Link href="/regional/tickets" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to tickets</Link>
      <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><PlusCircle className="text-emerald-600 dark:text-emerald-400" size={22} /> Log a Ticket</h1>
      <Card className="p-5">
        <RmNewTicketForm stores={stores} suppliers={suppliers} />
      </Card>
    </div>
  )
}
