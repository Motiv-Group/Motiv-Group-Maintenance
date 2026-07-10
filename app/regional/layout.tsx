import { requireRegionalUser } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function RegionalLayout({ children }: { children: React.ReactNode }) {
  const { fullName, regionIds } = await requireRegionalUser()
  const unreadCount = await getUnreadCount()
  // Region name(s) for the desktop sidebar context chip.
  let regionLabel: string | null = null
  if (regionIds.length) {
    const admin = createAdminClient()
    const { data } = await admin.from('regions').select('name').in('id', regionIds)
    const names = (data ?? []).map((r: any) => r.name).filter(Boolean)
    regionLabel = names.length === 1 ? names[0] : names.length > 1 ? `${names.length} regions` : null
  }
  return (
    <ExecChrome userName={fullName} variant="regional" unreadCount={unreadCount} contextLabel={regionLabel}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags', 'notifications', 'ticket_updates', 'ticket_disputes', 'ticket_dispute_messages']} />
      {children}
    </ExecChrome>
  )
}
