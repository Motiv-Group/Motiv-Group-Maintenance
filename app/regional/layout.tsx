import { requireRegionalUser } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'

export const dynamic = 'force-dynamic'

export default async function RegionalLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireRegionalUser()
  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} variant="regional" unreadCount={unreadCount}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags', 'notifications']} />
      {children}
    </ExecChrome>
  )
}
