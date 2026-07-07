export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { resolveRange, buildRegionalModel } from '@/lib/report-data'
import { addNarrative } from '@/lib/report-groq'
import { ReportDocument } from '@/components/reports/ReportDocument'
import { PrintButton } from '@/components/reports/PrintButton'

export default async function RegionalReportView(
  props: {
    searchParams: Promise<{ period?: string; from?: string; to?: string; stores?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('user_profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')

  const admin = createAdminClient()
  // v3: the RM's stores are those in the region(s) they manage (regional_users).
  // buildRegionalModel expects each store keyed as { company_name?, sub_store? },
  // so we map the stores.`name` column onto `company_name`.
  const { data: regions } = await admin
    .from('regional_users').select('region_id').eq('user_id', user.id)
  const regionIds = (regions ?? []).map(r => r.region_id)
  const { data: stores } = regionIds.length
    ? await admin.from('stores').select('id, name, sub_store').in('region_id', regionIds)
    : { data: [] as any[] }
  const ownStores = ((stores ?? []) as { id: string; name?: string; sub_store?: string }[])
    .map(s => ({ id: s.id, company_name: s.name, sub_store: s.sub_store }))
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
