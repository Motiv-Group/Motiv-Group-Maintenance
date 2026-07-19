import { requireStoreManagerV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'
import { createAdminClient } from '@/lib/supabase/server'
import { storeLabel } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { fullName, allStoreIds, activeStoreId, avatarUrl } = await requireStoreManagerV3()
  const unreadCount = await getUnreadCount()
  // All of the SM's stores → the sidebar switcher (chip when only one).
  let storeOptions: { id: string; label: string }[] = []
  if (allStoreIds.length) {
    const admin = createAdminClient()
    const { data } = await admin.from('stores').select('id, name, sub_store').in('id', allStoreIds)
    storeOptions = (data ?? []).map(s => ({ id: s.id, label: storeLabel(s.name, s.sub_store) })).sort((a, b) => a.label.localeCompare(b.label))
  }
  return (
    <ExecChrome userName={fullName} variant="store" unreadCount={unreadCount} avatarUrl={avatarUrl}
      contextOptions={storeOptions} activeContextId={activeStoreId} contextCookie="motiv_store">
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags', 'ticket_updates', 'notifications']} />
      {children}
    </ExecChrome>
  )
}
