import { requireExecutiveV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'

export const dynamic = 'force-dynamic'

export default async function ExecutiveLayout({ children }: { children: React.ReactNode }) {
  const { fullName, avatarUrl } = await requireExecutiveV3()
  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} unreadCount={unreadCount} avatarUrl={avatarUrl}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags', 'ticket_updates', 'decision_items', 'notifications']} />
      {children}
    </ExecChrome>
  )
}
