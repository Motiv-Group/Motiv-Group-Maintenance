import { requireSupplierV3 } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'
import { slaNeedsAcceptance } from '@/lib/sla'
import { SlaReacceptGate } from '@/components/supplier/SlaReacceptGate'

export const dynamic = 'force-dynamic'

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { userId, fullName } = await requireSupplierV3()

  // B12: gate all supplier work until they've accepted the CURRENT SLA version.
  // Fires on a SLA_VERSION bump and for pre-wizard invited suppliers who never
  // accepted (no acceptance row at all).
  const admin = createAdminClient()
  const { data: latest } = await admin
    .from('supplier_sla_acceptances')
    .select('sla_version')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const needsSla = slaNeedsAcceptance(latest?.sla_version ?? null)

  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} variant="supplier" unreadCount={unreadCount}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'notifications', 'ticket_disputes', 'ticket_dispute_messages']} />
      {needsSla ? <SlaReacceptGate signedNameDefault={fullName} /> : children}
    </ExecChrome>
  )
}
