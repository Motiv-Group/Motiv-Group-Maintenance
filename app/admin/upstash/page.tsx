export const dynamic = 'force-dynamic'

import { Zap, KeySquare, ShieldCheck, Gauge } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { getUpstashStats } from '@/lib/admin/upstash'
import { Card } from '@/components/exec/ui'
import { InfoTip } from '@/components/ui/InfoTip'
import { ProviderHeader, StatTile, Notice } from '@/components/admin/ui'
import { FREE_LIMITS, formatNumber } from '@/lib/admin/limits'

export default async function UpstashAdminPage() {
  await requireMasterAdmin()
  const res = await getUpstashStats()
  const d = res.data

  return (
    <div className="space-y-6">
      <ProviderHeader
        name="Upstash Redis"
        icon={<Zap className="text-amber-500" size={20} />}
        whatItIs="Serverless Redis used for distributed rate limiting (lib/rate-limit.ts). It stops one client hammering write/expensive routes across Vercel's whole serverless fleet. Without it, rate limiting degrades to weak per-instance counters — so 'reachable' here is a real security signal."
        result={res}
        dashboardUrl="https://console.upstash.com"
      />

      {d && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <StatTile
              label="Limiter status"
              icon={<ShieldCheck size={13} />}
              tone={d.reachable ? 'good' : 'bad'}
              value={d.reachable ? 'Active' : 'Down'}
              info={<>Whether the app can reach Upstash right now. Active = rate limiting is global and effective. Down = the limiter falls back to per-instance memory (much weaker against abuse/DoS).</>}
            />
            <StatTile
              label="Total keys"
              icon={<KeySquare size={13} />}
              tone="info"
              value={formatNumber(d.dbSize)}
              info={<>Every key stored in the Redis database (DBSIZE). For this app that&apos;s almost entirely short-lived rate-limit windows, which expire on their own.</>}
            />
            <StatTile
              label="Rate-limit keys"
              icon={<Gauge size={13} />}
              tone="info"
              value={formatNumber(d.rateLimitKeys)}
              info={<>Active keys under the <code className="font-mono">motiv-rl</code> prefix — one sliding window per (client, route) combination currently being tracked. A sudden spike can indicate an abuse attempt being throttled.</>}
            />
            <StatTile
              label="Free tier"
              icon={<Zap size={13} />}
              tone="gold"
              value={`${formatNumber(FREE_LIMITS.upstashCommandsPerDay)}/day`}
              info={<>Upstash Free allows ~{formatNumber(FREE_LIMITS.upstashCommandsPerDay)} commands/day (256 MB). Enough for a pilot; tight for high-traffic production rate limiting. Daily command/bandwidth counts aren&apos;t in the Redis REST API — see the console.</>}
              hint="commands"
            />
          </div>

          <Notice variant="info">
            Command volume, bandwidth and latency charts live in the Upstash console (or need the separate Management API + a new credential). This panel reads the database directly for what matters most: is the limiter alive and how many windows are active. Use the button above for usage graphs.
          </Notice>

          <Card className="p-5 space-y-2">
            <h2 className="text-sm font-bold text-[var(--text)] flex items-center gap-2">
              <ShieldCheck size={15} className="text-emerald-500" /> Why this matters
              <InfoTip title="Rate limiting">Rate limiting is the app&apos;s front-line defence against abuse — brute-force logins, spammy ticket creation, and expensive route hammering.</InfoTip>
            </h2>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Rate limits are enforced on write and expensive routes. When Upstash is <strong>Active</strong>, a client&apos;s limit is shared across every serverless instance, so the cap actually holds. When it&apos;s <strong>Down</strong>, each instance counts separately and the effective limit multiplies by the instance count — much easier to abuse. Treat a persistent &quot;Down&quot; here as a security issue, not just an ops blip.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
