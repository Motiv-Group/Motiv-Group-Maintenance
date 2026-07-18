export const dynamic = 'force-dynamic'

import { requireRegionalV3 } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { createAdminClient } from '@/lib/supabase/server'
import { RegionalStores, type ArchivedStore } from '@/components/exec/RegionalStores'
import { storeLabel } from '@/lib/utils'

export default async function RegionalStoresPage() {
  const { userId, companyId, regionIds } = await requireRegionalV3()
  const data = await assembleRegionalDashboard(companyId, regionIds)

  // Deactivated stores live in a separate archive (the dashboard only loads active ones).
  const admin = createAdminClient()
  const [{ data: archivedRaw }, { data: rmProfile }, { data: company }] = await Promise.all([
    regionIds.length
      ? admin.from('stores').select('id, name, sub_store, closed_at')
          .eq('company_id', companyId).in('region_id', regionIds).eq('active', false).order('closed_at', { ascending: false })
      : Promise.resolve({ data: null }),
    admin.from('user_profiles').select('company_name').eq('id', userId).maybeSingle(),
    admin.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ])
  const archived: ArchivedStore[] = (archivedRaw ?? []).map(s => ({ id: s.id, name: storeLabel(s.name, s.sub_store), deactivatedAt: s.closed_at ?? null }))
  // The RM's company applies to every store they manage — used to auto-fill the
  // company-name field on the add/edit store pop-ups.
  const companyName = rmProfile?.company_name || company?.name || ''

  return <RegionalStores stores={data.stores} archived={archived} companyName={companyName} />
}
