export const dynamic = 'force-dynamic'

import { Triangle, Rocket, Globe, GitBranch, Activity, BarChart3, ExternalLink } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { getVercelStats, type VercelDeployment, type VercelTarget } from '@/lib/admin/vercel'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { ProviderHeader, StatTile, Notice } from '@/components/admin/ui'
import { InfraTargetToggle } from '@/components/admin/InfraTargetToggle'

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

export default async function VercelAdminPage({ searchParams }: { searchParams: Promise<{ target?: string }> }) {
  await requireMasterAdmin()
  const target: VercelTarget = (await searchParams).target === 'website' ? 'website' : 'app'
  const res = await getVercelStats(target)
  const d = res.data

  const readyCount = d?.deployments.filter((x) => x.state === 'READY').length ?? 0
  const errorCount = d?.deployments.filter((x) => x.state === 'ERROR').length ?? 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">Viewing: <span className="font-semibold text-[var(--text)]">{target === 'website' ? 'Marketing website' : 'Production app'}</span></p>
        <InfraTargetToggle options={[{ key: 'app', label: 'Prod app' }, { key: 'website', label: 'Website' }]} current={target} />
      </div>
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
            <div className="hidden sm:block overflow-x-auto -mx-1">
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
            <div className="sm:hidden space-y-2">
              {d.deployments.map((x: VercelDeployment) => (
                <div key={x.uid} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-[var(--text)]">{x.commitMessage ?? '—'}</p>
                    <StateBadge state={x.state} />
                  </div>
                  <p className="mt-1 font-mono text-[12px] text-[var(--text-muted)] truncate">{x.branch ?? '—'}</p>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[12px]">
                    <span className="text-[var(--text-muted)]">{x.target ?? 'preview'}</span>
                    <span className="text-[var(--text-faint)]">{when(x.createdAt)}</span>
                  </div>
                </div>
              ))}
              {!d.deployments.length && <p className="py-6 text-center text-[var(--text-faint)]">No deployments reported.</p>}
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

      {/* Speed Insights + Web Analytics — enabled via the app (<SpeedInsights/> +
          <Analytics/> in the root layout, so they cover every page including /admin).
          Live numbers live in the Vercel dashboard: the API doesn't expose this data
          on the Hobby plan, so we surface status + a deep-link rather than fake it. */}
      <Card className="p-5 space-y-4">
        <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
          <Activity size={15} className="text-blue-500" /> Performance &amp; analytics
          <InfoTip title="Performance & analytics">Speed Insights measures real-user Core Web Vitals; Web Analytics counts page views + visitors. Both collect from production visitors and are viewable in the Vercel dashboard.</InfoTip>
        </h2>
        <div className="space-y-2.5">
          <AnalyticsRow
            icon={<Activity size={16} className="text-blue-500" />}
            title="Speed Insights"
            desc="Real-user Core Web Vitals — RES, FCP, LCP, INP, CLS, TTFB."
          />
          <AnalyticsRow
            icon={<BarChart3 size={16} className="text-blue-500" />}
            title="Web Analytics"
            desc="Page views, unique visitors, top pages and referrers."
          />
        </div>
        <Notice variant="info">
          Both are <b>enabled</b> and collect from real production visitors. The live charts (Real Experience Score, page views) aren&apos;t exposed by Vercel&apos;s API on the Hobby plan — open the Vercel dashboard to view them.
        </Notice>
      </Card>
    </div>
  )
}

function AnalyticsRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-2)] px-3.5 py-3 ring-1 ring-[var(--border)]">
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--text)]">{title}</p>
        <p className="text-[12px] text-[var(--text-muted)]">{desc}</p>
      </div>
      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Enabled</span>
      <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
        Open <ExternalLink size={12} />
      </a>
    </div>
  )
}
