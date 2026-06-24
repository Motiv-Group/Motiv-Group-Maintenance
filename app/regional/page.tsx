export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Clock, Settings } from 'lucide-react'
import { requireRegionalUser } from '@/lib/health/guard'
import { assembleRegionalDashboard } from '@/lib/health/data'
import { RegionalOverview } from '@/components/exec/RegionalOverview'
import { Card } from '@/components/exec/ui'
import { getDailyBriefing } from '@/lib/briefing/generate'
import { regionFacts } from '@/lib/briefing/facts'

export default async function RegionalOverviewPage() {
  const { companyId, regionIds, fullName, requestedRegionCode } = await requireRegionalUser()

  // Pending: signed up but not yet linked to a region by an executive.
  if (!companyId || regionIds.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <Card className="p-8 text-center space-y-4">
          <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-[#C6A35D]/15 ring-1 ring-[#C6A35D]/30">
            <Clock size={22} className="text-[#C6A35D]" />
          </span>
          <h1 className="text-xl font-bold text-[var(--text)]">Awaiting region assignment</h1>
          <p className="text-sm text-[var(--text-muted)]">
            Hi {fullName?.split(' ')[0] ?? 'there'} — your account is set up. Your executive needs to approve and link you to a region before your dashboard appears.
          </p>
          {requestedRegionCode
            ? <p className="text-sm text-[var(--text-muted)]">Region code you entered: <span className="font-semibold text-[#C6A35D]">{requestedRegionCode}</span>. If this is wrong, update it in Settings.</p>
            : <p className="text-sm text-amber-400">No region code on file — add the code your executive gave you in Settings.</p>}
          <Link href="/settings" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C6A35D] text-[#0a0e17] text-sm font-semibold hover:brightness-95 transition">
            <Settings size={15} /> Go to Settings
          </Link>
        </Card>
      </div>
    )
  }

  const data = await assembleRegionalDashboard(companyId, regionIds)
  const briefingScopeId = regionIds.slice().sort().join(',')
  const briefing = await getDailyBriefing({ companyId, scope: 'region', scopeId: briefingScopeId, role: 'regional_manager', facts: regionFacts(data) })
  return <RegionalOverview data={data} name={fullName} briefing={briefing} briefingScopeId={briefingScopeId} />
}
