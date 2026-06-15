export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveRange, buildSupplierModel } from '@/lib/report-data'
import { addNarrative } from '@/lib/report-groq'
import { ReportDocument } from '@/components/reports/ReportDocument'
import { PrintButton } from '@/components/reports/PrintButton'

export default async function SupplierReportView({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name, company_name').eq('id', user.id).single()
  if (profile?.role !== 'supplier') redirect('/auth/login')

  const range = resolveRange(searchParams.period ?? 'month', searchParams.from, searchParams.to)
  const admin = createAdminClient()
  const model = await buildSupplierModel(admin, user.id, profile.company_name || profile.full_name || 'Supplier', range)
  await addNarrative(model)

  return (
    <div className="py-2">
      <PrintButton />
      <ReportDocument model={model} />
    </div>
  )
}
