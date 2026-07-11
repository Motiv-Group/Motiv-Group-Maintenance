export const dynamic = 'force-dynamic'

import { Triangle, Rocket, Globe, GitBranch } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { getVercelStats, type VercelDeployment } from '@/lib/admin/vercel'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { ProviderHeader, StatTile, Notice } from '@/components/admin/ui'

const STATE_CLS: Record<string, string> = {
  READY:     'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30',
  ERROR:     'bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/30',
  BUILDING:  'bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-blue-500/30',
  QUEUED:    'bg-slate-400/15 text-[var(--text-muted)] ring-slate-400/30',
  CANCELED:  'bg-slate-400/15 text-[var(--text-muted)] ring-slate-400/30',
}
function StateBadge({ state }: { state: string }) {
  const cls = STATE_CLS[state] ?? 'bg-slate-400/15 text-[var(--text-muted)] ring-slate-400/30'
  return <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${cls}`}>{state}</span>
}
function when(ms: number | null): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function VercelAdminPage() {
  await requireMasterAdmin()
  const res = await getVercelStats()
  const d = res.data

  const readyCount = d?.deployments.filter((x) => x.state === 'READY').length ?? 0
  const errorCount = d?.deployments.filter((x) => x.state === 'ERROR').length ?? 0

  return (
    <div className="space-y-6">
      <ProviderHeader
        name="Vercel"
        icon={<Triangle className="text-[var(--text)]" size={20} />}
        whatItIs="The host — it runs the whole Next.js app, API routes and cron jobs. This panel shows recent deployments and their build status so you can see if the last push went live or failed, and which domains are wired up."
        result={res}
        dashboardUrl="https://vercel.com/dashboard"
      />

      {d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatTile
              label="Production"
              icon={<Rocket size={13} />}
              tone={d.latestProduction?.state === 'READY' ? 'good' : d.latestProduction?.state === 'ERROR' ? 'bad' : 'default'}
              value={d.latestProduction?.state ?? '—'}
              info={<>State of the current production deployment. READY = the live site is up. ERROR = the last production build failed (the previous good deploy stays live until fixed).</>}
              hint={when(d.latestProduction?.createdAt ?? null)}
            />
            <StatTile
              label="Recent ready"
              icon={<Rocket size={13} />}
              tone="good"
              value={readyCount}
              info={<>How many of the last 8 deployments built successfully. A run of failures here is your early warning that something in the build/CI is broken.</>}
              hint="of last 8"
            />
            <StatTile
              label="Recent failed"
              icon={<Rocket size={13} />}
              tone={errorCount > 0 ? 'bad' : 'good'}
              value={errorCount}
              info={<>Failed builds in the last 8 deployments. Click a failed one in the Vercel dashboard to see the build log.</>}
              hint="of last 8"
            />
            <StatTile
              label="Domains"
              icon={<Globe size={13} />}
              tone="info"
              value={d.domains.length}
              info={<>Custom domains attached to this project and whether each is verified. An unverified production domain means DNS isn&apos;t pointing correctly.</>}
              hint={d.projectName ? `project: ${d.projectName}` : undefined}
            />
          </div>

          <Notice variant="info">
            Traffic, bandwidth and Web Analytics aren&apos;t exposed by Vercel&apos;s API on the Hobby plan — those live only in the Vercel dashboard (and Web Analytics is a Pro add-on). This panel covers what the API gives us for free: deployments, build state and domains. Hobby is also non-commercial-license only.
          </Notice>

          {/* Deployments */}
          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <GitBranch size={15} className="text-[var(--text-muted)]" /> Recent deployments
              <InfoTip title="Deployments">Each push to the repo triggers a build. This lists the latest 8 with their branch, commit message, target (production/preview) and result.</InfoTip>
            </h2>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">When</th>
                    <th className="px-2">Branch</th>
                    <th className="px-2">Commit</th>
                    <th className="px-2">Target</th>
                    <th className="px-2 text-right">State</th>
                  </tr>
                </thead>
                <tbody>
                  {d.deployments.map((x: VercelDeployment) => (
                    <tr key={x.uid} className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                      <td className="py-2 px-2 text-[var(--text-muted)] whitespace-nowrap">{when(x.createdAt)}</td>
                      <td className="px-2 text-[var(--text-muted)] font-mono text-[12px]">{x.branch ?? '—'}</td>
                      <td className="px-2 text-[var(--text)] truncate max-w-[240px]">{x.commitMessage ?? '—'}</td>
                      <td className="px-2 text-[var(--text-muted)]">{x.target ?? 'preview'}</td>
                      <td className="px-2 text-right"><StateBadge state={x.state} /></td>
                    </tr>
                  ))}
                  {!d.deployments.length && <tr><td colSpan={5} className="py-6 text-center text-[var(--text-faint)]">No deployments reported.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>

          {d.domains.length > 0 && (
            <Card className="p-5 space-y-3">
              <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2"><Globe size={15} className="text-blue-500" /> Domains</h2>
              <div className="flex flex-wrap gap-2">
                {d.domains.map((dm) => (
                  <span key={dm.name} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ring-1 ${dm.verified ? 'ring-emerald-500/30 text-emerald-700 dark:text-emerald-400' : 'ring-amber-500/30 text-amber-700 dark:text-amber-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${dm.verified ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {dm.name}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
