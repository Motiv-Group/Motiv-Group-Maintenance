export const dynamic = 'force-dynamic'

import { requireMasterAdmin } from '@/lib/health/guard'
import { getAppSettings } from '@/lib/settings-server'
import { CustomizationClient } from '@/components/admin/CustomizationClient'

export default async function CustomizationPage() {
  // Defence in depth — middleware already gates /admin/* to system_admin.
  await requireMasterAdmin()
  const settings = await getAppSettings()
  return <CustomizationClient initial={settings} />
}
