export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ClipboardCheck, Building2, ChevronDown, ChevronUp } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { PriorityBadge } from '@/components/ui/PriorityBadge'
import { storeLabel, rmStatusMeta, formatDateTime } from '@/lib/utils'

interface Row { id: string; title: string; priority: string; supplier: string; status: string; createdAt: string }
type Group = [string, { branchCode: string | null; rows: Row[] }]

export default async function RegionalSignoffPage() {
  const { companyId, regionIds } = await requireRegionalV3()
  const admin = createAdminClient()

  let groups: Group[] = []
  if (regionIds.length) {
    const { data: tickets } = await admin.from('tickets').select('id, title, store_id, priority, supplier_id, status, created_at')
      .eq('company_id', companyId).in('region_id', regionIds).eq('status', 'submitted_for_signoff')
    const tks = tickets ?? []
    if (tks.length) {
      const supplierIds = Array.from(new Set(tks.map(t => t.supplier_id).filter(Boolean)))
      const [{ data: stores }, { data: suppliers }] = await Promise.all([
        admin.from('stores').select('id, name, sub_store, branch_code').in('id', Array.from(new Set(tks.map(t => t.store_id))) as string[]),
        supplierIds.length ? admin.from('suppliers').select('id, company_name').in('id', supplierIds as string[]) : Promise.resolve({ data: [] as any[] }),
      ])
      const storeName = new Map((stores ?? []).map((s: any) => [s.id, storeLabel(s.name, s.sub_store)]))
      const storeBranch = new Map((stores ?? []).map((s: any) => [s.id, s.branch_code ?? null]))
      const supplierName = new Map((suppliers ?? []).map((s: any) => [s.id, s.company_name]))
      const m = new Map<string, { branchCode: string | null; rows: Row[] }>()
      for (const t of tks) {
        const name = storeName.get(t.store_id) ?? 'Store'
        const g = m.get(name) ?? { branchCode: storeBranch.get(t.store_id) ?? null, rows: [] as Row[] }
        g.rows.push({ id: t.id, title: t.title ?? 'Ticket', priority: t.priority, supplier: supplierName.get(t.supplier_id) ?? 'Unassigned', status: t.status, createdAt: t.created_at })
        m.set(name, g)
      }
      groups = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    }
  }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><ClipboardCheck className="text-emerald-600 dark:text-emerald-400" size={22} /> Signoff</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Jobs awaiting your sign-off, grouped by store. Tap a ticket to review and approve or reject.</p></div>

      {!groups.length ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] p-12 text-center">
          <ClipboardCheck size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
          <p className="text-sm text-[var(--text-faint)]">Nothing awaiting sign-off.</p>
        </div>
      ) : groups.map(([store, g]) => (
        <details key={store} className="group rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
          <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none hover:bg-[var(--hover)] transition">
            <Building2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="flex-1 min-w-0 text-sm font-bold text-[var(--text)] truncate">{store}{g.branchCode ? ` · ${g.branchCode}` : ''}</span>
            <span className="text-[11px] font-semibold text-[var(--text-muted)] bg-black/5 dark:bg-white/10 rounded-full px-2 py-0.5 shrink-0">{g.rows.length} job{g.rows.length !== 1 ? 's' : ''}</span>
            <ChevronDown size={16} className="text-[var(--text-faint)] shrink-0 group-open:hidden" />
            <ChevronUp size={16} className="text-[var(--text-faint)] shrink-0 hidden group-open:block" />
          </summary>
          <div className="border-t border-[var(--border)]">
            {g.rows.map(r => {
              const sm = rmStatusMeta(r.status)
              return (
                <Link key={r.id} href={`/regional/tickets/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--border)] last:border-0 hover:bg-[var(--hover)] transition">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text)] truncate">{r.title}</p>
                    <p className="text-[11px] text-[var(--text-faint)] truncate">{r.supplier} · {formatDateTime(r.createdAt)}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[4.5rem_7rem] gap-1.5 shrink-0 justify-items-end sm:justify-items-stretch">
                    <PriorityBadge priority={r.priority} className="w-full text-center" />
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full w-full text-center ${sm.cls}`}>{sm.label}</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </details>
      ))}
    </div>
  )
}
