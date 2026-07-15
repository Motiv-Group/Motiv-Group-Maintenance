export const dynamic = 'force-dynamic'

import { ShieldAlert, Bug, Activity, Users, CheckCircle2 } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { getSentryStats, type SentryIssue } from '@/lib/admin/sentry'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { ProviderHeader, StatTile, Notice } from '@/components/admin/ui'
import { FREE_LIMITS, formatNumber } from '@/lib/admin/limits'

const LEVEL_CLS: Record<string, string> = {
  fatal:   'ring-red-600/40 text-red-800 dark:text-red-300',
  error:   'ring-red-500/30 text-red-700 dark:text-red-400',
  warning: 'ring-amber-500/30 text-amber-700 dark:text-amber-400',
  info:    'ring-blue-500/30 text-blue-700 dark:text-blue-400',
}
function ago(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default async function SentryAdminPage() {
  await requireMasterAdmin()
  const res = await getSentryStats()
  const d = res.data

  return (
    <div className="space-y-6">
      <ProviderHeader
        name="Sentry"
        icon={<ShieldAlert className="text-red-500" size={20} />}
        whatItIs="Error monitoring — it captures unhandled exceptions and crashes from the live app (browser and server). This is how you find out a user hit a bug before they tell you. Unresolved issues here are your real-world bug backlog, ranked by how often they fire."
        result={res}
        dashboardUrl="https://sentry.io"
      />

      {d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatTile
              label="Unresolved issues"
              icon={<Bug size={13} />}
              tone={d.unresolved.length > 0 ? 'bad' : 'good'}
              value={formatNumber(d.unresolved.length)}
              info={<>Distinct error groups still open (not resolved/ignored) in the last 14 days. Each groups many occurrences of the same bug. Zero is the goal; anything here is worth triaging.</>}
              hint="last 14 days"
            />
            <StatTile
              label="Events / 24h"
              icon={<Activity size={13} />}
              tone={d.eventsLast24h && d.eventsLast24h > 0 ? 'warn' : 'good'}
              value={formatNumber(d.eventsLast24h)}
              info={<>Total error events received in the last 24 hours (every occurrence, not just distinct issues). A sudden spike usually means a fresh regression just shipped.</>}
            />
            <StatTile
              label="Top issue impact"
              icon={<Users size={13} />}
              tone="default"
              value={formatNumber(d.unresolved[0]?.userCount ?? null)}
              info={<>Number of distinct users affected by the most-frequent unresolved issue. High user impact = prioritise it, even if the raw event count looks modest.</>}
              hint={d.unresolved[0]?.title ? 'users hit by #1' : undefined}
            />
            <StatTile
              label="Free tier"
              icon={<ShieldAlert size={13} />}
              tone="gold"
              value={`${formatNumber(FREE_LIMITS.sentryEventsPerMonth)}/mo`}
              info={<>Sentry&apos;s free plan covers ~{formatNumber(FREE_LIMITS.sentryEventsPerMonth)} events/month. A noisy bug can burn through this fast — resolve or mute high-volume issues to stay under the cap.</>}
              hint="events"
            />
          </div>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <Bug size={15} className="text-red-500" /> Unresolved issues
              <InfoTip title="Issues">The open bug backlog from real users, most-recent first. Count = how many times it fired; users = how many distinct people hit it. Click through to Sentry for the full stack trace.</InfoTip>
            </h2>
            <div className="hidden sm:block overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Issue</th>
                    <th className="px-2">Level</th>
                    <th className="px-2 text-right">Events</th>
                    <th className="px-2 text-right">Users</th>
                    <th className="px-2 text-right">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {d.unresolved.map((i: SentryIssue) => (
                    <tr key={i.id} className="border-b border-[var(--border)] last:border-0 transition hover:bg-[var(--hover)]">
                      <td className="py-2 px-2 max-w-[280px]">
                        {i.permalink
                          ? <a href={i.permalink} target="_blank" rel="noopener noreferrer" className="text-[var(--text)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate">{i.title}</a>
                          : <span className="text-[var(--text)] block truncate">{i.title}</span>}
                        {i.culprit && <span className="block text-[11px] text-[var(--text-faint)] font-mono truncate">{i.culprit}</span>}
                      </td>
                      <td className="px-2">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${LEVEL_CLS[i.level ?? ''] ?? 'ring-slate-400/30 text-[var(--text-muted)]'}`}>{i.level ?? '—'}</span>
                      </td>
                      <td className="px-2 text-right text-[var(--text-muted)] tabular-nums">{formatNumber(i.count == null ? null : Number(i.count))}</td>
                      <td className="px-2 text-right text-[var(--text-muted)] tabular-nums">{formatNumber(i.userCount)}</td>
                      <td className="px-2 text-right text-[var(--text-muted)] whitespace-nowrap">{ago(i.lastSeen)}</td>
                    </tr>
                  ))}
                  {!d.unresolved.length && <tr><td colSpan={5} className="py-6 text-center"><span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={15} /> No unresolved issues — all clear.</span></td></tr>}
                </tbody>
              </table>
            </div>

            <div className="sm:hidden space-y-2">
              {d.unresolved.map((i: SentryIssue) => (
                <div key={i.id} className="rounded-xl bg-[var(--surface-2)] ring-1 ring-[var(--border)] p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {i.permalink
                        ? <a href={i.permalink} target="_blank" rel="noopener noreferrer" className="font-bold text-[var(--text)] hover:text-blue-600 dark:hover:text-blue-400 transition-colors block truncate">{i.title}</a>
                        : <span className="font-bold text-[var(--text)] block truncate">{i.title}</span>}
                      {i.culprit && <span className="block text-[11px] text-[var(--text-faint)] font-mono truncate">{i.culprit}</span>}
                    </div>
                    <span className={`shrink-0 inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${LEVEL_CLS[i.level ?? ''] ?? 'ring-slate-400/30 text-[var(--text-muted)]'}`}>{i.level ?? '—'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-muted)]">
                    <span>Events <span className="tabular-nums text-[var(--text)]">{formatNumber(i.count == null ? null : Number(i.count))}</span></span>
                    <span>Users <span className="tabular-nums text-[var(--text)]">{formatNumber(i.userCount)}</span></span>
                    <span>Last seen <span className="text-[var(--text)]">{ago(i.lastSeen)}</span></span>
                  </div>
                </div>
              ))}
              {!d.unresolved.length && <div className="py-6 text-center"><span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={15} /> No unresolved issues — all clear.</span></div>}
            </div>
          </Card>

          <Notice variant="info">
            Full stack traces, breadcrumbs, release tracking and alerting live in Sentry — this panel is a triage summary. Errors also depend on the browser/server Sentry SDK being wired (NEXT_PUBLIC_SENTRY_DSN); if that&apos;s unset, nothing gets captured in the first place.
          </Notice>
        </>
      )}
    </div>
  )
}
