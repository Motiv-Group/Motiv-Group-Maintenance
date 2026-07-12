export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Star, Clock } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { DashboardHealthHeader } from '@/components/exec/DashboardHealthHeader'
import { SupplierPriorityWorkQueue } from '@/components/supplier/SupplierPriorityWorkQueue'
import { createAdminClient } from '@/lib/supabase/server'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { supplierFacts } from '@/lib/briefing/facts'

export default async function SupplierOverviewPage() {
  const { companyId, supplierIds, fullName } = await requireSupplierV3()

  // Standalone (self-signup) suppliers have no client company. PENDING ones can now
  // browse the whole dashboard while they wait — a gentle note points them to the
  // verification-docs uploader (moved to Settings → Account). VERIFIED ones just see
  // the dashboard (assembleSupplierDashboard handles a null company).
  let pending = false
  if (!companyId) {
    const admin = createAdminClient()
    const { data: supRow } = await admin.from('suppliers')
      .select('verification_status, is_motiv').in('id', supplierIds).limit(1).maybeSingle()
    pending = (supRow as any)?.verification_status !== 'verified' && !(supRow as any)?.is_motiv
  }

  const d = await assembleSupplierDashboard(companyId, supplierIds)
  const perf = d.perf
  const briefingScopeId = supplierIds.slice().sort().join(',')
  const briefing = companyId
    ? await getDailyBriefing({ companyId, scope: 'supplier', scopeId: briefingScopeId, role: 'supplier', facts: supplierFacts(d) })
    : null
  const greeting = (() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()

  return (
    <div className="space-y-5">
      {pending && (
        <Link href="/settings" className="flex items-start gap-2.5 rounded-xl bg-amber-500/10 ring-1 ring-amber-500/30 px-3.5 py-3 transition hover:bg-amber-500/15">
          <Clock size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
          <p className="text-sm text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">Your account is under review.</span> Feel free to look around while you wait — upload your verification documents in <span className="font-semibold text-[var(--text)]">Settings → Account</span> to speed up approval.</p>
        </Link>
      )}
      {/* Page header — greeting (left) + SLA donut + AI briefing (right), same as the
          RM / SM homes. The supplier's rating link sits under the greeting. */}
      <DashboardHealthHeader
        greeting={greeting}
        name={fullName}
        subtitle="Your assigned work, quotes, sign-offs and performance."
        scopePrefix="Your SLA"
        donutLabel="SLA"
        score={perf.performanceScore}
        status={perf.band}
        briefingBody={briefing?.body}
        briefingHeadline={briefing?.headline}
        briefingScope="supplier"
        briefingScopeId={briefingScopeId}
        aside={
          <Link href="/supplier/reviews" className="inline-flex items-center gap-2 rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)] px-3.5 py-1.5 transition hover:bg-[var(--hover)]" title="View your reviews">
            <Star size={16} className="shrink-0 fill-amber-400 text-amber-400" />
            <span className="text-sm font-bold text-[var(--text)]">{d.rating.avg.toFixed(1)} / 5</span>
            <span className="text-xs text-[var(--text-muted)]">{d.rating.count ? `(${d.rating.count} review${d.rating.count !== 1 ? 's' : ''})` : '(new)'}</span>
          </Link>
        }
      />

      {/* Filtering KPI cards + phase-aware priority queue (matches SM / RM). */}
      <SupplierPriorityWorkQueue tickets={d.tickets} generatedAt={d.generatedAt} company={d.company} />
    </div>
  )
}
