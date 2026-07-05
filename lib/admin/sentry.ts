import 'server-only'
import { fetchJson } from './http'
import { ok, degraded, unconfigured, errored, type ProviderResult } from './types'

export interface SentryIssue {
  id: string
  title: string
  culprit: string | null
  level: string | null       // error | warning | fatal | ...
  count: string | null       // event count (string from API)
  userCount: number | null
  lastSeen: string | null
  permalink: string | null
}
export interface SentryStats {
  org: string
  project: string
  unresolved: SentryIssue[]
  eventsLast24h: number | null
}

export async function getSentryStats(): Promise<ProviderResult<SentryStats>> {
  const token = process.env.SENTRY_AUTH_TOKEN
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  if (!token || !org || !project) {
    return unconfigured('Set SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT to show unresolved errors and event volume here.')
  }
  const headers = { Authorization: `Bearer ${token}` }
  const base = `${sentryApiHost()}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}`

  const [issuesRes, statsRes] = await Promise.all([
    fetchJson<any[]>(`${base}/issues/?query=is:unresolved&statsPeriod=14d&limit=10`, { headers }),
    fetchJson<[number, number][]>(`${base}/stats/?stat=received&resolution=1h&since=${Math.floor(Date.now() / 1000) - 86400}`, { headers }),
  ])

  if (!issuesRes.ok && (issuesRes.status === 401 || issuesRes.status === 403)) {
    return errored('Sentry rejected the token (auth failed). The token needs project:read on this org/project.')
  }
  if (!issuesRes.ok) {
    return errored(`Couldn't reach Sentry: ${issuesRes.error ?? 'unknown error'}. Check SENTRY_ORG/SENTRY_PROJECT slugs.`)
  }

  const unresolved: SentryIssue[] = ((issuesRes.body ?? []) as any[]).map((i) => ({
    id: i.id,
    title: i.title ?? i.metadata?.type ?? 'Issue',
    culprit: i.culprit ?? null,
    level: i.level ?? null,
    count: i.count ?? null,
    userCount: typeof i.userCount === 'number' ? i.userCount : null,
    lastSeen: i.lastSeen ?? null,
    permalink: i.permalink ?? null,
  }))

  // stats endpoint returns [ [unixTs, count], ... ] over the window.
  const eventsLast24h = statsRes.ok && Array.isArray(statsRes.body)
    ? statsRes.body.reduce((a, [, c]) => a + (Number(c) || 0), 0)
    : null

  const payload = { org, project, unresolved, eventsLast24h }
  return statsRes.ok ? ok(payload) : degraded(payload, 'Issues loaded; event-volume stats were unavailable.')
}

// Sentry's API is region-scoped. EU-region orgs must hit https://de.sentry.io,
// US https://us.sentry.io (or the legacy https://sentry.io). We derive the
// region from the ingest host in NEXT_PUBLIC_SENTRY_DSN (…ingest.<region>.
// sentry.io); SENTRY_BASE_URL overrides if you ever need to force it.
function sentryApiHost(): string {
  const override = process.env.SENTRY_BASE_URL
  if (override) return override.replace(/\/+$/, '')
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN ?? ''
  const m = dsn.match(/ingest\.([a-z0-9-]+)\.sentry\.io/i)
  return m ? `https://${m[1]}.sentry.io` : 'https://sentry.io'
}
