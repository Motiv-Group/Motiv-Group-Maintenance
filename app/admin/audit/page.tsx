export const dynamic = 'force-dynamic'

import { ScrollText } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { Card } from '@/components/exec/ui'
import { Notice } from '@/components/admin/ui'
import { formatDateTime } from '@/lib/utils'

// Human labels for the namespaced action verbs written by lib/audit.ts. Unknown
// actions fall back to the raw verb so nothing is ever hidden.
const ACTION_LABELS: Record<string, string> = {
  'provision.add_region': 'Region created',
  'provision.invite_rm': 'Regional manager invited',
  'provision.approve_rm': 'Regional manager approved',
  'provision.reject_rm': 'Regional manager rejected',
  'provision.add_store': 'Store created',
  'provision.invite_store_manager': 'Store manager invited',
  'provision.create_store_manager': 'Store manager created',
  'provision.add_supplier': 'Supplier added',
  'provision.update_store': 'Store updated',
  'provision.deactivate_store': 'Store deactivated',
  'provision.reactivate_store': 'Store reactivated',
  'provision.delete_store': 'Store deleted',
  'admin.create_executive': 'Executive + company created',
  'admin.invite_rm': 'Regional manager invited',
  'admin.invite_sm': 'Store manager invited',
  'admin.bulk_import': 'Bulk account import',
  'admin.move_store': 'Store moved',
  'admin.relink_rm': 'Regional manager re-linked',
  'supplier.approve': 'Supplier approved',
  'supplier.reject': 'Supplier rejected',
  'supplier.onboard_invited': 'Supplier onboarded (invited)',
  'supplier.onboard_self_signup': 'Supplier self-signup',
  'supplier.assign_rm': 'RM assigned to region',
  'supplier.unassign_rm': 'RM unassigned from region',
  'account.self_delete': 'Account self-deleted (POPIA)',
}

// Read-only audit trail of privileged actions (B10). Uses the service-role client
// so a system_admin sees every company's rows (the "audit read" RLS policy is
// company-scoped and would otherwise hide cross-company events).
export default async function AdminAuditPage() {
  await requireMasterAdmin()
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, metadata, created_at, actor_id, company_id')
    .order('created_at', { ascending: false })
    .limit(200)
  const logs = (rows ?? []) as any[]

  // Resolve actor + company names in one round-trip each.
  const actorIds = [...new Set(logs.map(l => l.actor_id).filter(Boolean))]
  const companyIds = [...new Set(logs.map(l => l.company_id).filter(Boolean))]
  const [actorsRes, companiesRes] = await Promise.all([
    actorIds.length
      ? admin.from('user_profiles').select('id, full_name, email, role').in('id', actorIds)
      : Promise.resolve({ data: [] as any[] }),
    companyIds.length
      ? admin.from('companies').select('id, name').in('id', companyIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const actorById = new Map(((actorsRes.data ?? []) as any[]).map(a => [a.id, a]))
  const companyById = new Map(((companiesRes.data ?? []) as any[]).map(c => [c.id, c]))

  const label = (action: string) => ACTION_LABELS[action] ?? action

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <ScrollText size={22} className="text-[#C6A35D]" /> Audit log
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Every privileged action — provisioning, account operations and role changes — recorded append-only. Most recent first.
        </p>
      </div>

      {!logs.length && (
        <Card className="p-8 text-center">
          <ScrollText className="mx-auto mb-2 text-[var(--text-faint)]" size={24} />
          <p className="text-sm text-[var(--text-muted)]">No audit events recorded yet.</p>
        </Card>
      )}

      {!!logs.length && (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2.5 px-3">When</th>
                  <th className="px-3">Actor</th>
                  <th className="px-3">Action</th>
                  <th className="px-3">Target</th>
                  <th className="px-3">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => {
                  const actor = actorById.get(l.actor_id) as any
                  const company = companyById.get(l.company_id) as any
                  return (
                    <tr key={l.id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="py-2.5 px-3 whitespace-nowrap text-[var(--text-muted)]">{formatDateTime(l.created_at)}</td>
                      <td className="px-3">
                        <div className="text-[var(--text)]">{actor ? (actor.full_name || actor.email || 'Unknown') : 'System'}</div>
                        {actor?.role && <div className="text-[11px] text-[var(--text-faint)]">{actor.role}</div>}
                      </td>
                      <td className="px-3">
                        <div className="text-[var(--text)] font-medium">{label(l.action)}</div>
                        <div className="text-[11px] text-[var(--text-faint)] font-mono">{l.action}</div>
                      </td>
                      <td className="px-3 text-[var(--text-muted)]">
                        {l.entity_type ?? '—'}
                        {company && <div className="text-[11px] text-[var(--text-faint)]">{company.name}</div>}
                      </td>
                      <td className="px-3 max-w-[280px]">
                        {l.metadata
                          ? <code className="block text-[11px] text-[var(--text-faint)] break-words whitespace-pre-wrap">{JSON.stringify(l.metadata)}</code>
                          : <span className="text-[var(--text-faint)]">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Notice variant="info">
        Append-only record of privileged actions (account provisioning, role changes, supplier verification, account deletion). Showing the latest 200 events. Rows are written server-side with the service-role client and are read-only to end users.
      </Notice>
    </div>
  )
}
