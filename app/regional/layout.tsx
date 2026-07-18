import { requireRegionalUser } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RegionalLayout({ children }: { children: React.ReactNode }) {
  const { fullName, allRegionIds, activeRegionId } = await requireRegionalUser()
  const unreadCount = await getUnreadCount()
  // All of the RM's regions → the sidebar switcher (chip when only one).
  let regionOptions: { id: string; label: string }[] = []
  if (allRegionIds.length) {
    const admin = createAdminClient()
    const { data } = await admin.from('regions').select('id, name').in('id', allRegionIds)
    regionOptions = (data ?? []).map(r => ({ id: r.id, label: r.name ?? 'Region' })).sort((a, b) => a.label.localeCompare(b.label))
  }
  return (
    <ExecChrome userName={fullName} variant="regional" unreadCount={unreadCount}
      contextOptions={regionOptions} activeContextId={activeRegionId} contextCookie="motiv_region">
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags', 'notifications', 'ticket_updates', 'ticket_disputes', 'ticket_dispute_messages', 'projects', 'project_stores', 'project_files']} />
      {children}
    </ExecChrome>
  )
}
