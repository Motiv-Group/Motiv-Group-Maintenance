export const dynamic = 'force-dynamic'

import { Truck, FileText, ShieldCheck } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { signManyUrls } from '@/lib/storage'
import { Card } from '@/components/exec/ui'
import { formatDateTime } from '@/lib/utils'
import { SupplierReviewActions } from '@/components/admin/SupplierReviewActions'
import { SupplierTabs } from '@/components/admin/SupplierTabs'
import { SupplierDirectory, type DirectorySupplier } from '@/components/admin/SupplierDirectory'
import { MotivAccessRequests, type MotivAccessRequest } from '@/components/admin/MotivAccessRequests'

const DOC_LABEL: Record<string, string> = {
  cipc: 'CIPC registration', vat_cert: 'VAT certificate', insurance: 'Liability insurance',
  qualification: 'Trade qualification', other: 'Other document',
}

// Admin Suppliers: a Directory of every supplier across companies + the Motiv
// pool (view details, add a supplier to a company), and a Review queue for
// self-signup suppliers awaiting verification.
export default async function AdminSuppliersPage() {
  await requireMasterAdmin()
  const admin = createAdminClient()

  const [{ data: pending }, { data: recent }, { data: allSuppliers }, { data: links }, { data: companies }] = await Promise.all([
    admin.from('suppliers')
      .select('id, company_name, contact_name, email, phone, address, trades, trade, vat_number, created_at')
      .in('source', ['self_signup', 'motiv_invite']).eq('verification_status', 'pending_review').order('created_at', { ascending: true }),
    admin.from('suppliers')
      .select('id, company_name, verification_status, created_at')
      .in('source', ['self_signup', 'motiv_invite']).in('verification_status', ['verified', 'rejected'])
      .order('created_at', { ascending: false }).limit(10),
    admin.from('suppliers').select('id, company_name, contact_name, email, phone, trades, trade, verification_status, source, is_motiv').eq('active', true),
    admin.from('company_suppliers').select('supplier_id, company_id'),
    admin.from('companies').select('id, name').eq('active', true).order('name'),
  ])

  // Companies requesting access to the Motiv directory (pending admin approval).
  const { data: motivReqRows } = await admin.from('company_motiv_access').select('company_id, requested_at').eq('status', 'pending').order('requested_at')
  const companyNameById = new Map((companies ?? []).map(c => [c.id, c.name]))
  const motivRequests: MotivAccessRequest[] = (motivReqRows ?? [])
    .filter((r): r is { company_id: string; requested_at: string } => !!r.company_id)
    .map(r => ({ companyId: r.company_id, companyName: companyNameById.get(r.company_id) ?? 'Company', requestedAt: r.requested_at }))

  // ── Review queue ───────────────────────────────────────────────────────────
  const rows = pending ?? []
  const supplierIds = rows.map(r => r.id)
  const { data: docRows } = supplierIds.length
    ? await admin.from('supplier_verification_docs').select('supplier_id, kind, url, uploaded_at').in('supplier_id', supplierIds).order('uploaded_at', { ascending: true })
    : { data: null }
  const docs = docRows ?? []
  const signed = await signManyUrls(docs.map(d => d.url))
  docs.forEach((d, i) => { d.url = signed[i] ?? d.url })
  const docsBySupplier = new Map<string, typeof docs>()
  for (const d of docs) { const list = docsBySupplier.get(d.supplier_id) ?? []; list.push(d); docsBySupplier.set(d.supplier_id, list) }
  const { data: slaRows } = supplierIds.length
    ? await admin.from('supplier_sla_acceptances').select('supplier_id, sla_version, signed_name, accepted_at').in('supplier_id', supplierIds)
    : { data: null }
  const slaBySupplier = new Map((slaRows ?? []).map(s => [s.supplier_id, s] as const))

  // ── Directory ────────────────────────────────────────────────────────────────
  const companyName = new Map((companies ?? []).map(c => [c.id, c.name]))
  const companyOpts = (companies ?? []).map(c => ({ id: c.id, name: c.name }))
  const companiesBySupplier = new Map<string, { id: string; name: string }[]>()
  for (const l of (links ?? [])) {
    const name = companyName.get(l.company_id); if (!name) continue
    const a = companiesBySupplier.get(l.supplier_id) ?? []; a.push({ id: l.company_id, name }); companiesBySupplier.set(l.supplier_id, a)
  }
  const directory: DirectorySupplier[] = (allSuppliers ?? []).map(s => ({
    id: s.id, name: s.company_name, contact: s.contact_name ?? null, email: s.email ?? null, phone: s.phone ?? null,
    trades: (s.trades as string[] | null) ?? (s.trade ? [s.trade] : []),
    verified: s.verification_status === 'verified',
    pendingReview: s.verification_status === 'pending_review',
    isMotiv: s.source === 'self_signup' || s.source === 'motiv_invite' || s.is_motiv === true,
    companies: (companiesBySupplier.get(s.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
  })).sort((a, b) => a.name.localeCompare(b.name))

  const reviewPanel = (
    <div className="space-y-5">
      {!rows.length && (
        <Card className="p-6 sm:p-8 text-center">
          <ShieldCheck className="mx-auto mb-2 text-emerald-500" size={24} />
          <p className="text-sm text-[var(--text-muted)]">No suppliers waiting for review.</p>
        </Card>
      )}
      {rows.map(s => {
        const sla = slaBySupplier.get(s.id)
        const sdocs = docsBySupplier.get(s.id) ?? []
        return (
          <Card key={s.id} className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h2 className="font-semibold text-[var(--text)]">{s.company_name}</h2>
                <p className="text-sm text-[var(--text-muted)]">{s.contact_name ?? '—'} · {s.email ?? '—'} · {s.phone ?? '—'}</p>
                {s.address && <p className="text-sm text-[var(--text-faint)]">{s.address}</p>}
                <p className="text-[11px] text-[var(--text-faint)] mt-1">Registered {formatDateTime(s.created_at)}</p>
              </div>
              <SupplierReviewActions supplierId={s.id} companyName={s.company_name} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">Trades</div>
                <div className="flex flex-wrap gap-1.5">
                  {((s.trades as string[] | null) ?? (s.trade ? [s.trade] : [])).map((t: string) => (
                    <span key={t} className="rounded-full bg-slate-500/15 text-slate-600 dark:text-slate-300 px-2 py-0.5 text-xs font-medium">{t}</span>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">VAT</div>
                <div className="text-[var(--text)]">{s.vat_number ? s.vat_number : 'Not VAT-registered'}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1">SLA signature</div>
                <div className="text-[var(--text)]">
                  {sla ? <>v{sla.sla_version} — “{sla.signed_name}”, {formatDateTime(sla.accepted_at)}</> : <span className="text-red-600 dark:text-red-400">Missing</span>}
                </div>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">Verification documents ({sdocs.length})</div>
              {sdocs.length ? (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {sdocs.map((d, i) => (
                    <a key={i} href={d.url} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                      <FileText size={14} /> {DOC_LABEL[d.kind] ?? d.kind}
                    </a>
                  ))}
                </div>
              ) : <p className="text-sm text-[var(--text-faint)]">None uploaded yet.</p>}
            </div>
          </Card>
        )
      })}
      {!!(recent ?? []).length && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-[var(--text)] mb-2">Recently reviewed</h2>
          <ul className="divide-y divide-[var(--border)]">
            {(recent ?? []).map(r => (
              <li key={r.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[var(--text)]">{r.company_name}</span>
                <span className={r.verification_status === 'verified' ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-red-600 dark:text-red-400 font-medium'}>
                  {r.verification_status === 'verified' ? 'Approved' : 'Rejected'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck size={22} className="text-blue-600 dark:text-blue-400" /> Suppliers</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Every supplier across companies and the Motiv pool. Review self-signups before they receive work.</p>
      </div>
      <MotivAccessRequests requests={motivRequests} />
      <SupplierTabs
        pendingCount={rows.length}
        defaultTab={rows.length ? 'review' : 'directory'}
        directory={<SupplierDirectory suppliers={directory} companies={companyOpts} />}
        review={reviewPanel}
      />
    </div>
  )
}
