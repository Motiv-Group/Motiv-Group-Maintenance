import { requireStoreManagerV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'
import { createAdminClient } from '@/lib/supabase/server'
import { storeLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { fullName, storeIds } = await requireStoreManagerV3()
  const unreadCount = await getUnreadCount()
  let storeName: string | null = null
  if (storeIds[0]) {
    const admin = createAdminClient()
    const { data: store } = await admin.from('stores').select('name, sub_store').eq('id', storeIds[0]).maybeSingle()
    if (store) storeName = storeLabel((store as any).name, (store as any).sub_store)
  }
  return (
    <ExecChrome userName={fullName} variant="store" unreadCount={unreadCount} contextLabel={storeName}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'notifications']} />
      {children}
    </ExecChrome>
  )
}
