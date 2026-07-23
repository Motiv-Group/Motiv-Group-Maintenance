export const dynamic = 'force-dynamic'

import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { FALLBACK_SLA } from '@/lib/health/constants'
import type { Priority } from '@/lib/health/types'
import { SlaConfigClient, type SlaRules, type CompanySla } from '@/components/admin/SlaConfigClient'

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4']

type SlaRow = {
  company_id: string | null
  priority: string
  first_response_mins: number
  attendance_mins: number
  quote_due_mins: number
  resolution_mins: number
  internal_decision_mins: number
}

// Effective rules for a target: its own saved rows, each field falling back to the
// provided default (Motiv rows fall back to the hardcoded FALLBACK_SLA).
function resolveRules(rows: SlaRow[], fallback: SlaRules): SlaRules {
  return Object.fromEntries(PRIORITIES.map(p => {
    const r = rows.find(x => x.priority === p)
    const f = fallback[p]
    return [p, {
      first_response_mins: r?.first_response_mins ?? f.first_response_mins,
      attendance_mins: r?.attendance_mins ?? f.attendance_mins,
      quote_due_mins: r?.quote_due_mins ?? f.quote_due_mins,
      resolution_mins: r?.resolution_mins ?? f.resolution_mins,
      internal_decision_mins: r?.internal_decision_mins ?? f.internal_decision_mins,
    }]
  })) as SlaRules
}

export default async function AdminSlaPage() {
  // Defence in depth — middleware already gates /admin/* to system_admin.
  await requireMasterAdmin()
  const admin = createAdminClient()

  const [{ data: rules }, { data: companies }] = await Promise.all([
    admin.from('sla_rules').select('company_id, priority, first_response_mins, attendance_mins, quote_due_mins, resolution_mins, internal_decision_mins'),
    admin.from('companies').select('id, name').eq('active', true).order('name'),
  ])
  const allRows = (rules ?? []) as SlaRow[]

  // FALLBACK_SLA is the hardcoded floor; the Motiv (global, company_id NULL) rows
  // are the platform default every company inherits unless it sets its own.
  const fallbackAsRules = resolveRules([], FALLBACK_SLA as unknown as SlaRules)
  const motiv = resolveRules(allRows.filter(r => r.company_id === null), fallbackAsRules)

  const companyList: CompanySla[] = (companies ?? []).map(c => {
    const rows = allRows.filter(r => r.company_id === c.id)
    return { id: c.id, name: c.name, overridden: rows.length > 0, rules: resolveRules(rows, motiv) }
  })

  return <SlaConfigClient motiv={motiv} companies={companyList} />
}
