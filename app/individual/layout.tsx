import { requireIndividual } from '@/lib/health/guard'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'

export const dynamic = 'force-dynamic'

export default async function IndividualLayout({ children }: { children: React.ReactNode }) {
  const { fullName } = await requireIndividual()
  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} variant="individual" unreadCount={unreadCount}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'notifications']} />
      {children}
    </ExecChrome>
  )
}
