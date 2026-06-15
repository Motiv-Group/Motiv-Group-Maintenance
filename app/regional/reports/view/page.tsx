export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveRange, buildRegionalModel } from '@/lib/report-data'
import { addNarrative } from '@/lib/report-groq'
import { ReportDocument } from '@/components/reports/ReportDocument'
import { PrintButton } from '@/components/reports/PrintButton'

export default async function RegionalReportView({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string; stores?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')

  const admin = createAdminClient()
  const { data: stores } = await admin
    .from('profiles').select('id, company_name, sub_store')
    .eq('regional_manager_id', user.id).in('role', ['store_manager', 'client'])
  const ownStores = (stores ?? []) as { id: string; company_name?: string; sub_store?: string }[]
  const ownIds = new Set(ownStores.map(s => s.id))

  const requested = (searchParams.stores ?? '').split(',').map(s => s.trim()).filter(Boolean).filter(id => ownIds.has(id))
  const selected = requested.length ? requested : ownStores.map(s => s.id)
  const storeMap = Object.fromEntries(ownStores.map(s => [s.id, s]))

  const range = resolveRange(searchParams.period ?? 'month', searchParams.from, searchParams.to)
  const model = await buildRegionalModel(admin, profile.full_name || 'Regional Manager', selected, storeMap, range)
  await addNarrative(model)

  return (
    <div className="py-2">
      <PrintButton />
      <ReportDocument model={model} />
    </div>
  )
}
