export const dynamic = 'force-dynamic'

import { Mail, AtSign, KeyRound, Globe } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { getResendStats, type ResendDomain } from '@/lib/admin/resend'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { ProviderHeader, StatTile, Notice } from '@/components/admin/ui'
import { FREE_LIMITS, formatNumber } from '@/lib/admin/limits'

function statusCls(s: string): string {
  const v = s.toLowerCase()
  if (v === 'verified') return 'ring-emerald-500/30 text-emerald-700 dark:text-emerald-400'
  if (v === 'pending' || v === 'not_started') return 'ring-[#C6A35D]/30 text-amber-700 dark:text-[#C6A35D]'
  return 'ring-red-500/30 text-red-700 dark:text-red-400'
}

export default async function ResendAdminPage() {
  await requireMasterAdmin()
  const res = await getResendStats()
  const d = res.data
  const verified = d?.domains.filter((x) => x.status.toLowerCase() === 'verified').length ?? 0

  return (
    <div className="space-y-6">
      <ProviderHeader
        name="Resend"
        icon={<Mail className="text-blue-500" size={20} />}
        whatItIs="The transactional email service — it sends store-manager invites, supplier onboarding links and password/welcome emails (lib/email.ts). If a sending domain isn't verified, those emails silently fail to deliver, so keep an eye on domain status here."
        result={res}
        dashboardUrl="https://resend.com/overview"
      />

      {d && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              label="Sending domains"
              icon={<Globe size={13} />}
              tone="info"
              value={formatNumber(d.domains.length)}
              info={<>Domains registered with Resend for sending. Free tier allows a single verified domain. Each must pass DNS (SPF/DKIM) verification before it can send.</>}
              hint={`${verified} verified`}
            />
            <StatTile
              label="From address"
              icon={<AtSign size={13} />}
              tone={d.fromAddress ? 'good' : 'bad'}
              value={<span className="text-sm break-all">{d.fromAddress ?? 'Not set'}</span>}
              info={<>The EMAIL_FROM env var — the address invites/onboarding emails are sent from. If it&apos;s not set, email no-ops even with a valid API key.</>}
            />
            <StatTile
              label="API keys"
              icon={<KeyRound size={13} />}
              tone="default"
              value={d.apiKeyCount == null ? '—' : formatNumber(d.apiKeyCount)}
              info={<>How many Resend API keys exist on the account. More keys than you recognise is worth investigating — rotate anything unexpected.</>}
            />
            <StatTile
              label="Free tier"
              icon={<Mail size={13} />}
              tone="gold"
              value={`${formatNumber(FREE_LIMITS.resendPerDay)}/day`}
              info={<>Resend Free allows ~{formatNumber(FREE_LIMITS.resendPerMonth)} emails/month and ~{formatNumber(FREE_LIMITS.resendPerDay)}/day on one domain. Per-message send counts aren&apos;t exposed by the API on free — see the Resend dashboard for volume.</>}
              hint={`~${formatNumber(FREE_LIMITS.resendPerMonth)}/mo`}
            />
          </div>

          <Notice variant="info">
            Delivery/open/bounce analytics and per-email history live in the Resend dashboard — the free API exposes domains and keys, not send metrics. Use the button above to jump to full analytics.
          </Notice>

          <Card className="p-5 space-y-4">
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <Globe size={15} className="text-blue-500" /> Domains
              <InfoTip title="Domains">Each sending domain and its verification status. A domain must be <strong>verified</strong> for email to leave the building — pending/failure means DNS records need fixing.</InfoTip>
            </h2>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-left text-[11px] text-[var(--text-faint)] border-b border-[var(--border)]">
                    <th className="py-2 px-2">Domain</th>
                    <th className="px-2">Region</th>
                    <th className="px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {d.domains.map((dm: ResendDomain) => (
                    <tr key={dm.name} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 px-2 font-mono text-[13px] text-[var(--text)]">{dm.name}</td>
                      <td className="px-2 text-[var(--text-muted)]">{dm.region ?? '—'}</td>
                      <td className="px-2 text-right">
                        <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ring-1 ${statusCls(dm.status)}`}>{dm.status}</span>
                      </td>
                    </tr>
                  ))}
                  {!d.domains.length && <tr><td colSpan={3} className="py-6 text-center text-[var(--text-faint)]">No domains registered.</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
