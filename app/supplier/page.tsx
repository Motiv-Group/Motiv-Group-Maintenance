export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Truck, Star, Sparkles } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { Card, Donut, Pill } from '@/components/exec/ui'
import { BriefingRefresh } from '@/components/briefing/BriefingRefresh'
import { VerificationCard } from '@/components/supplier/VerificationCard'
import { SupplierPriorityWorkQueue } from '@/components/supplier/SupplierPriorityWorkQueue'
import { AiBriefing } from '@/components/briefing/AiBriefing'
import { createAdminClient } from '@/lib/supabase/server'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { supplierFacts } from '@/lib/briefing/facts'

export default async function SupplierOverviewPage() {
  const { companyId, supplierIds, fullName } = await requireSupplierV3()

  // Standalone (self-signup) suppliers have no client company. Pending ones see
  // the under-review + verification-docs card; verified ones a "you're live"
  // state until Motiv-pool work reaches them via the normal ticket pages.
  if (!companyId) {
    const admin = createAdminClient()
    const { data: supRow } = await admin.from('suppliers')
      .select('company_name, verification_status, is_motiv').in('id', supplierIds).limit(1).maybeSingle()
    const pending = (supRow as any)?.verification_status !== 'verified' && !(supRow as any)?.is_motiv
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-blue-600 dark:text-blue-400" size={22} /> {(supRow as any)?.company_name ?? fullName ?? 'Supplier'}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {pending ? 'Welcome to Motiv — your registration is being reviewed.' : 'You are live in the Motiv supplier pool.'}
          </p>
        </div>
        {pending
          ? <VerificationCard />
          : (
            <Card className="p-5">
              <p className="text-sm text-[var(--text-muted)]">
                You&apos;re verified ✅ — job invitations will appear under <Link href="/supplier/tickets" className="text-blue-600 dark:text-blue-400 hover:underline">Tickets</Link> and
                you&apos;ll be notified the moment a client assigns you work.
              </p>
            </Card>
          )}
      </div>
    )
  }

  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const perf = d.perf
  const briefingScopeId = supplierIds.slice().sort().join(',')
  const briefing = await getDailyBriefing({ companyId, scope: 'supplier', scopeId: briefingScopeId, role: 'supplier', facts: supplierFacts(d) })

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><Truck className="text-blue-600 dark:text-blue-400" size={22} /> {fullName ?? 'Supplier'}</h1>
          <Link href="/supplier/reviews" className="inline-flex items-center gap-2 shrink-0 rounded-full bg-[var(--surface-2)] ring-1 ring-[#C6A35D]/40 px-4 py-1.5 hover:bg-[var(--hover)] transition" title="View your reviews">
            <Star size={17} className="fill-amber-400 text-amber-400 shrink-0" />
            <span className="text-sm font-bold text-[var(--text)]">{d.rating.avg.toFixed(1)} / 5</span>
            <span className="text-xs text-amber-600 dark:text-amber-400/80">{d.rating.count ? `(${d.rating.count} review${d.rating.count !== 1 ? 's' : ''})` : '(new)'}</span>
          </Link>
        </div>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Your assigned work, quotes, sign-offs and performance.</p>
      </div>

      {/* SLA health hero — donut + AI summary inside (matches RM / SM / Executive) */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <Donut value={perf.performanceScore} status={perf.band} size={140} label="SLA" />
          <div className="flex-1 min-w-0 w-full space-y-3 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-[var(--text)]">SLA Health</h2>
              <Pill status={perf.band} />
              <span className="ml-auto"><BriefingRefresh scope="supplier" scopeId={briefingScopeId} /></span>
            </div>
            {briefing?.body && (
              <div className="flex items-start gap-2 justify-center sm:justify-start text-left">
                <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-[#C6A35D] bg-[#C6A35D]/10 rounded-full px-1.5 py-0.5"><Sparkles size={10} /> AI</span>
                <AiBriefing headline={briefing.headline} body={briefing.body} className="text-sm leading-relaxed text-[var(--text-muted)]" />
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Filtering KPI cards + phase-aware priority queue (matches SM / RM). */}
      <SupplierPriorityWorkQueue tickets={d.tickets} generatedAt={d.generatedAt} company={d.company} />
    </div>
  )
}
