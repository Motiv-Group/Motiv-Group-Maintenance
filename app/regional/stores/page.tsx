export const dynamic = 'force-dynamic'

import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { createAdminClient } from '@/lib/supabase/server'
import { RegionalStores, type ArchivedStore } from '@/components/exec/RegionalStores'
import { storeLabel } from '@/lib/utils'

export default async function RegionalStoresPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const data = await assembleRegionalDashboard(companyId, regionIds)

  // Deactivated stores live in a separate archive (the dashboard only loads active ones).
  const admin = createAdminClient()
  const { data: archivedRaw } = regionIds.length
    ? await admin.from('stores').select('id, name, sub_store, closed_at')
        .eq('company_id', companyId).in('region_id', regionIds).eq('active', false).order('closed_at', { ascending: false })
    : { data: [] as any[] }
  const archived: ArchivedStore[] = ((archivedRaw ?? []) as any[]).map(s => ({ id: s.id, name: storeLabel(s.name, s.sub_store), deactivatedAt: s.closed_at ?? null }))

  return <RegionalStores stores={data.stores} archived={archived} />
}
