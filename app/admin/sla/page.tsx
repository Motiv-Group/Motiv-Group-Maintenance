export const dynamic = 'force-dynamic'

import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { FALLBACK_SLA } from '@/lib/health/constants'
import type { Priority } from '@/lib/health/types'
import { SlaConfigClient, type SlaRules } from '@/components/admin/SlaConfigClient'

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4']

export default async function AdminSlaPage() {
  // Defence in depth — middleware already gates /admin/* to system_admin.
  await requireMasterAdmin()
  const admin = createAdminClient()
  // The platform-global rules (company_id NULL), merged over the hardcoded fallback.
  const { data } = await admin.from('sla_rules').select('*').is('company_id', null)
  const initial = Object.fromEntries(PRIORITIES.map(p => {
    const r = (data ?? []).find(x => x.priority === p)
    const f = FALLBACK_SLA[p]
    return [p, {
      first_response_mins: r?.first_response_mins ?? f.first_response_mins,
      attendance_mins: r?.attendance_mins ?? f.attendance_mins,
      quote_due_mins: r?.quote_due_mins ?? f.quote_due_mins,
      resolution_mins: r?.resolution_mins ?? f.resolution_mins,
      internal_decision_mins: r?.internal_decision_mins ?? f.internal_decision_mins,
    }]
  })) as SlaRules
  return <SlaConfigClient initial={initial} />
}
