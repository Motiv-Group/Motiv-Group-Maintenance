export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { StoreBudgetForm } from '@/components/regional/StoreBudgetForm'

export default async function StoreBudgetPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')

  const admin = createAdminClient()
  // v3: store lives on `stores`; RM ownership is via region (regional_users).
  const { data: regions } = await admin
    .from('regional_users').select('region_id').eq('user_id', user.id)
  const regionIds = (regions ?? []).map(r => r.region_id)

  const { data: store } = await admin
    .from('stores').select('id, name, sub_store, capex_budget, region_id')
    .eq('id', params.id).single()

  if (!store || !store.region_id || !regionIds.includes(store.region_id)) notFound()

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Capex Budget</h1>
          <p className="text-sm text-brand-600 dark:text-brand-400">
            {store.name}{store.sub_store ? ` — ${store.sub_store}` : ''}
          </p>
        </div>
      </div>

      <StoreBudgetForm storeId={store.id} current={store.capex_budget ?? null} />
    </div>
  )
}
