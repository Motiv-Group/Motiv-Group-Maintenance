import { requireSupplierV3 } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { ExecChrome, type AccountStatus } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'
import { slaNeedsAcceptance } from '@/lib/sla'
import { SlaReacceptGate } from '@/components/supplier/SlaReacceptGate'

export const dynamic = 'force-dynamic'

export default async function SupplierLayout({ children }: { children: React.ReactNode }) {
  const { userId, fullName, companyId, supplierIds } = await requireSupplierV3()

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

  // Verification pill in the sidebar profile block — only for standalone
  // (self-signup) suppliers, who go through the verification flow. Gentle wording.
  let accountStatus: AccountStatus | null = null
  if (!companyId) {
    const { data: sup } = await admin.from('suppliers').select('verification_status, is_motiv').in('id', supplierIds).limit(1).maybeSingle()
    const verified = sup?.verification_status === 'verified' || sup?.is_motiv === true
    accountStatus = verified ? { label: 'Verified', tone: 'emerald' } : { label: 'Pending verification', tone: 'amber' }
  }

  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={fullName} variant="supplier" unreadCount={unreadCount} accountStatus={accountStatus}>
      <RealtimeRefresh tables={['tickets', 'quotes', 'signoffs', 'snags', 'ticket_updates', 'ratings', 'notifications', 'ticket_disputes', 'ticket_dispute_messages']} />
      {needsSla ? <SlaReacceptGate signedNameDefault={fullName} /> : children}
    </ExecChrome>
  )
}
