export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Star, Clock } from 'lucide-react'
import { requireSupplierV3 } from '@/lib/health/guard'
import { assembleSupplierDashboard } from '@/lib/health/data'
import { DashboardHealthHeader } from '@/components/exec/DashboardHealthHeader'
import { SupplierPriorityWorkQueue } from '@/components/supplier/SupplierPriorityWorkQueue'
import { createAdminClient } from '@/lib/supabase/server'
import { chatUnreadCounts } from '@/lib/chat-unread'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { supplierFacts } from '@/lib/briefing/facts'

export default async function SupplierOverviewPage() {
  const { userId, companyId, supplierIds, fullName } = await requireSupplierV3()
  const admin = createAdminClient()

  // Standalone (self-signup) suppliers have no client company. PENDING ones can now
  // browse the whole dashboard while they wait — a gentle note points them to the
  // verification-docs uploader (moved to Settings → Account). VERIFIED ones just see
  // the dashboard (assembleSupplierDashboard handles a null company).
  let pending = false
  if (!companyId) {
    const { data: supRow } = await admin.from('suppliers')
      .select('verification_status, is_motiv').in('id', supplierIds).limit(1).maybeSingle()
    pending = supRow?.verification_status !== 'verified' && !supRow?.is_motiv
  }

  const d = await assembleSupplierDashboard(companyId, supplierIds, new Date(), userId)
  const perf = d.perf
  // Unread chat counts for the queue rows' chips — awarded jobs only (the chat opens
  // on award), so this never reads beyond this supplier's own tickets.
  const chatUnread = await chatUnreadCounts(admin, userId, d.tickets.filter(t => t.awardedToMe).map(t => t.id))
  const briefingScopeId = supplierIds.slice().sort().join(',')
  // Standalone (self-signup) suppliers have no client company, so key the daily
  // briefing cache on their own supplier id (a non-null UUID, no companies FK) — this
  // gives verified standalone suppliers the same AI overview as company-linked ones.
  const briefingCacheKey = companyId ?? supplierIds[0]
  const briefing = briefingCacheKey
    ? await getDailyBriefing({ companyId: briefingCacheKey, scope: 'supplier', scopeId: briefingScopeId, role: 'supplier', facts: supplierFacts(d) })
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
          <Link href="/supplier/reviews" className="inline-flex items-center gap-2.5 rounded-full bg-[var(--surface-2)] ring-1 ring-[var(--border)] px-3.5 py-2.5 sm:py-1.5 transition hover:bg-[var(--hover)]" title="View your reviews">
            <span className="inline-flex items-center gap-1.5">
              <Star size={15} className="shrink-0 fill-amber-400 text-amber-400" />
              <span className="text-sm font-bold text-[var(--text)]">{d.rating.avg.toFixed(1)}</span>
              <span className="text-xs text-[var(--text-faint)]">/5</span>
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {d.rating.count ? `${d.rating.count} review${d.rating.count !== 1 ? 's' : ''}` : 'new'}
            </span>
            <span className="h-3.5 w-px bg-[var(--border)]" />
            <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">View reviews →</span>
          </Link>
        }
      />

      {/* Filtering KPI cards + phase-aware priority queue (matches SM / RM). */}
      <SupplierPriorityWorkQueue tickets={d.tickets} generatedAt={d.generatedAt} company={d.company} chatUnread={chatUnread} />
    </div>
  )
}
