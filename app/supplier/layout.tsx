import { requireSupplierV3 } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'

export const dynamic = 'force-dynamic'

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireSupplierV3()
  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} variant="supplier" unreadCount={unreadCount}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'notifications', 'ticket_disputes', 'ticket_dispute_messages']} />
      {children}
    </ExecChrome>
  )
}
