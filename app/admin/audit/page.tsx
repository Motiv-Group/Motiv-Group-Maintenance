export const dynamic = 'force-dynamic'

import { ScrollText, Users } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { Card } from '@/components/exec/ui'
import { Notice } from '@/components/admin/ui'
import AuditFilters from '@/components/admin/AuditFilters'
import { formatDate, formatDateTime } from '@/lib/utils'

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

// Range key → ISO cutoff. `new Date()` is fine here (this is the page file, not a
// workflow script). `all`/unknown returns null (no cutoff).
function cutoffFor(range: string): string | null {
  const d = new Date()
  switch (range) {
    case 'week': d.setDate(d.getDate() - 7); return d.toISOString()
    case 'month': d.setMonth(d.getMonth() - 1); return d.toISOString()
    case 'quarter': d.setMonth(d.getMonth() - 3); return d.toISOString()
    default: return null
  }
}

// Relative "Nd ago" for a sign-in timestamp, or null when never.
function relativeDays(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return '1d ago'
  return `${days}d ago`
}

// Per-user sign-in window from the auth store: last_sign_in_at (Last seen) and an
// approximate first-seen = confirmed_at ?? created_at (no migration; chosen).
type SignIn = { last: string | null; first: string | null }
async function loadSignIns(admin: ReturnType<typeof createAdminClient>): Promise<Map<string, SignIn>> {
  const map = new Map<string, SignIn>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const list = data?.users ?? []
    if (error || !list.length) break
    for (const u of list) {
      map.set(u.id, {
        last: u.last_sign_in_at ?? null,
        first: u.confirmed_at ?? u.created_at ?? null,
      })
    }
    if (list.length < 1000) break
  }
  return map
}

const SIGN_IN_CAP = 200

// Read-only audit trail of privileged actions (B10). Uses the service-role client
// so a system_admin sees every company's rows (the "audit read" RLS policy is
// company-scoped and would otherwise hide cross-company events).
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; action?: string; q?: string }>
}) {
  await requireMasterAdmin()
  const admin = createAdminClient()

  const sp = await searchParams
  const range = sp.range ?? 'all'
  const action = sp.action ?? ''
  const q = (sp.q ?? '').trim()
  const filtered = (range && range !== 'all') || !!action || !!q
  const cutoff = cutoffFor(range)

  // Bump the fetch cap when filtering so `q` (applied after name-resolution) has
  // a deeper set to match against.
  let query = admin
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, metadata, created_at, actor_id, company_id')
    .order('created_at', { ascending: false })
    .limit(filtered ? 500 : 200)
  if (cutoff) query = query.gte('created_at', cutoff)
  if (action) query = query.eq('action', action)
  const { data: rows } = await query
  let logs = rows ?? []

  // Resolve actor + company names, plus the full sign-in window in parallel.
  const actorIds = [...new Set(logs.map(l => l.actor_id).filter((v): v is string => !!v))]
  const companyIds = [...new Set(logs.map(l => l.company_id).filter((v): v is string => !!v))]
  const [actorsRes, companiesRes, allProfilesRes, allCompaniesRes, signIns] = await Promise.all([
    actorIds.length
      ? admin.from('user_profiles').select('id, full_name, email, role').in('id', actorIds)
      : Promise.resolve({ data: null }),
    companyIds.length
      ? admin.from('companies').select('id, name').in('id', companyIds)
      : Promise.resolve({ data: null }),
    admin.from('user_profiles').select('id, full_name, email, role, company_id'),
    admin.from('companies').select('id, name'),
    loadSignIns(admin),
  ])
  // Keys typed `string | null` so lookups by the logs' nullable actor_id/company_id
  // stay direct (a null key is simply never present — same misses as before).
  const actorById = new Map<string | null, NonNullable<typeof actorsRes.data>[number]>((actorsRes.data ?? []).map(a => [a.id, a]))
  const companyById = new Map<string | null, NonNullable<typeof companiesRes.data>[number]>((companiesRes.data ?? []).map(c => [c.id, c]))

  const label = (action: string) => ACTION_LABELS[action] ?? action

  // Free-text filter — applied AFTER name resolution so it can match the human
  // action label, actor name/email, company name, entity type and metadata JSON.
  if (q) {
    const needle = q.toLowerCase()
    logs = logs.filter(l => {
      const actor = actorById.get(l.actor_id)
      const company = companyById.get(l.company_id)
      const hay = [
        label(l.action),
        l.action,
        actor?.full_name ?? '',
        actor?.email ?? '',
        company?.name ?? '',
        l.entity_type ?? '',
        l.metadata ? JSON.stringify(l.metadata) : '',
      ].join(' ').toLowerCase()
      return hay.includes(needle)
    })
  }

  // ── Sign-in view rows ──────────────────────────────────────────
  const companyNameById = new Map<string, string>((allCompaniesRes.data ?? []).map(c => [c.id, c.name]))
  const signInRows = (allProfilesRes.data ?? []).map(p => {
    const si = signIns.get(p.id) ?? { last: null, first: null }
    return {
      id: p.id,
      name: p.full_name || p.email || 'Unknown',
      email: p.email as string | null,
      role: p.role as string | null,
      company: p.company_id ? (companyNameById.get(p.company_id) ?? null) : null,
      last: si.last,
      first: si.first,
    }
  })
  // Sort by last seen desc, nulls (never) last.
  signInRows.sort((a, b) => {
    const ta = a.last ? new Date(a.last).getTime() : -Infinity
    const tb = b.last ? new Date(b.last).getTime() : -Infinity
    return tb - ta
  })
  const signInTotal = signInRows.length
  const signInShown = signInRows.slice(0, SIGN_IN_CAP)
  const signInTruncated = signInTotal > SIGN_IN_CAP

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <ScrollText size={22} className="text-blue-600 dark:text-blue-400" /> Audit log
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Every privileged action — provisioning, account operations and role changes — recorded append-only. Most recent first.
        </p>
      </div>

      <Card className="p-3 sm:p-4">
        <AuditFilters range={range} action={action} q={q} />
      </Card>

      <p className="text-[13px] text-[var(--text-muted)]">
        {logs.length} {logs.length === 1 ? 'event' : 'events'}
        {filtered ? ' matching filters' : ' (latest 200)'}
        {filtered && logs.length >= 500 ? ' — showing the newest 500; narrow the range to see more.' : ''}
      </p>

      {!logs.length && (
        <Card className="p-6 sm:p-8 text-center">
          <ScrollText className="mx-auto mb-2 text-[var(--text-faint)]" size={24} />
          <p className="text-sm text-[var(--text-muted)]">
            {filtered ? 'No audit events match these filters.' : 'No audit events recorded yet.'}
          </p>
        </Card>
      )}

      {!!logs.length && (
        <Card className="p-0 overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
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
                  const actor = actorById.get(l.actor_id)
                  const company = companyById.get(l.company_id)
                  return (
                    <tr key={l.id} className="border-b border-[var(--border)] last:border-0 align-top transition hover:bg-[var(--hover)]">
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

          <div className="sm:hidden space-y-2 p-3">
            {logs.map(l => {
              const actor = actorById.get(l.actor_id)
              const company = companyById.get(l.company_id)
              return (
                <div key={l.id} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--text)] truncate">{label(l.action)}</div>
                    <div className="text-[11px] text-[var(--text-faint)] font-mono truncate">{l.action}</div>
                  </div>
                  <dl className="mt-2 space-y-1 text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-faint)] shrink-0">When</dt>
                      <dd className="text-right text-[var(--text-muted)]">{formatDateTime(l.created_at)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-faint)] shrink-0">Actor</dt>
                      <dd className="text-right min-w-0">
                        <div className="text-[var(--text)] truncate">{actor ? (actor.full_name || actor.email || 'Unknown') : 'System'}</div>
                        {actor?.role && <div className="text-[11px] text-[var(--text-faint)]">{actor.role}</div>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-faint)] shrink-0">Target</dt>
                      <dd className="text-right min-w-0 text-[var(--text-muted)]">
                        <div className="truncate">{l.entity_type ?? '—'}</div>
                        {company && <div className="text-[11px] text-[var(--text-faint)] truncate">{company.name}</div>}
                      </dd>
                    </div>
                  </dl>
                  {l.metadata && (
                    <div className="mt-2">
                      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">Details</div>
                      <code className="block mt-0.5 text-[11px] text-[var(--text-faint)] break-words whitespace-pre-wrap">{JSON.stringify(l.metadata)}</code>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {/* ── User sign-ins ─────────────────────────────────────────── */}
      <div className="pt-2">
        <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
          <Users size={18} className="text-blue-600 dark:text-blue-400" /> User sign-ins
        </h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          First and last time each account was seen. First seen is approximate (account confirmed/created date).
          {signInTruncated && ` Showing the ${SIGN_IN_CAP} most-recently-active of ${signInTotal}.`}
        </p>
      </div>

      {!signInShown.length ? (
        <Card className="p-6 sm:p-8 text-center">
          <Users className="mx-auto mb-2 text-[var(--text-faint)]" size={24} />
          <p className="text-sm text-[var(--text-muted)]">No user accounts found.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--text-faint)] border-b border-[var(--border)]">
                  <th className="py-2.5 px-3">Name</th>
                  <th className="px-3">Role</th>
                  <th className="px-3">Company</th>
                  <th className="px-3">First seen</th>
                  <th className="px-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {signInShown.map(u => (
                  <tr key={u.id} className="border-b border-[var(--border)] last:border-0 align-top transition hover:bg-[var(--hover)]">
                    <td className="py-2.5 px-3">
                      <div className="text-[var(--text)]">{u.name}</div>
                      {u.email && u.email !== u.name && <div className="text-[11px] text-[var(--text-faint)]">{u.email}</div>}
                    </td>
                    <td className="px-3 text-[var(--text-muted)]">{u.role ?? '—'}</td>
                    <td className="px-3 text-[var(--text-muted)]">{u.company ?? '—'}</td>
                    <td className="px-3 whitespace-nowrap text-[var(--text-muted)]">{u.first ? formatDate(u.first) : '—'}</td>
                    <td className="px-3 whitespace-nowrap">
                      {u.last ? (
                        <span className="text-[var(--text-muted)]">
                          {formatDate(u.last)} <span className="text-[var(--text-faint)]">· {relativeDays(u.last)}</span>
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">Never</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="sm:hidden space-y-2 p-3">
            {signInShown.map(u => (
              <div key={u.id} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--text)] truncate">{u.name}</div>
                    <div className="text-[11px] text-[var(--text-faint)] truncate">{u.role ?? '—'}{u.company ? ` · ${u.company}` : ''}</div>
                  </div>
                  {!u.last && (
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400">Never</span>
                  )}
                </div>
                <dl className="mt-2 space-y-1 text-[13px]">
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-faint)] shrink-0">First seen</dt>
                    <dd className="text-right text-[var(--text-muted)]">{u.first ? formatDate(u.first) : '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[var(--text-faint)] shrink-0">Last seen</dt>
                    <dd className="text-right text-[var(--text-muted)]">
                      {u.last ? <>{formatDate(u.last)} <span className="text-[var(--text-faint)]">· {relativeDays(u.last)}</span></> : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Notice variant="info">
        Append-only record of privileged actions (account provisioning, role changes, supplier verification, account deletion). Rows are written server-side with the service-role client and are read-only to end users. Use the filters above to narrow by period, action type or free-text search.
      </Notice>
    </div>
  )
}
