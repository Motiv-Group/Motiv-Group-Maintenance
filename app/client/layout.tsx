import { requireStoreManagerV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'

export const dynamic = 'force-dynamic'

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireStoreManagerV3()
  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} variant="store" unreadCount={unreadCount}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'notifications']} />
      {children}
    </ExecChrome>
  )
}
