export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ReportBuilder } from '@/components/reports/ReportBuilder'

export default async function RegionalReportsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')

  const admin = createAdminClient()
  const { data: stores } = await admin
    .from('profiles').select('id, company_name, sub_store')
    .eq('regional_manager_id', user.id).in('role', ['store_manager', 'client'])
    .order('company_name')

  const opts = (stores ?? []).map((s: any) => ({
    id: s.id,
    label: `${s.company_name ?? '—'}${s.sub_store ? ' — ' + s.sub_store : ''}`,
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Reports</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Generate a multi-store performance report. Pick the stores and period to include.
        </p>
      </div>
      <ReportBuilder role="regional" stores={opts} />
    </div>
  )
}
