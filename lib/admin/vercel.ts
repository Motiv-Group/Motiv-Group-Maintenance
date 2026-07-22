import 'server-only'
import { fetchJson } from './http'
import { ok, degraded, unconfigured, errored, type ProviderResult } from './types'

export interface VercelDeployment {
  uid: string
  state: string            // READY | ERROR | BUILDING | QUEUED | CANCELED
  target: string | null    // production | preview | null
  createdAt: number | null
  url: string | null
  commitMessage: string | null
  branch: string | null
}
export interface VercelStats {
  projectName: string | null
  deployments: VercelDeployment[]
  domains: { name: string; verified: boolean }[]
  latestProduction: VercelDeployment | null
}

// Minimal shapes of the Vercel REST payloads (only the fields read below).
interface VercelApiDeployment {
  uid?: string
  id?: string
  state?: string
  readyState?: string
  target?: string | null
  createdAt?: number
  created?: number
  url?: string
  meta?: { githubCommitMessage?: string; gitCommitMessage?: string; githubCommitRef?: string; gitBranch?: string }
}
interface VercelApiProject { name?: string }
interface VercelApiDomain { name: string; verified?: boolean }

// Two switchable targets: the main app project, or a separate marketing "website"
// project. The website reuses the same token/team by default, overridable via
// *_WEBSITE env vars if it lives under a different Vercel account/team.
export type VercelTarget = 'app' | 'website'

function auth(target: VercelTarget) {
  if (target === 'website') {
    return {
      token: process.env.VERCEL_API_TOKEN_WEBSITE ?? process.env.VERCEL_API_TOKEN,
      projectId: process.env.VERCEL_PROJECT_ID_WEBSITE,
      teamId: process.env.VERCEL_TEAM_ID_WEBSITE ?? process.env.VERCEL_TEAM_ID,
    }
  }
  return { token: process.env.VERCEL_API_TOKEN, projectId: process.env.VERCEL_PROJECT_ID, teamId: process.env.VERCEL_TEAM_ID }
}
function teamQ(teamId?: string) { return teamId ? `&teamId=${encodeURIComponent(teamId)}` : '' }

export async function getVercelStats(target: VercelTarget = 'app'): Promise<ProviderResult<VercelStats>> {
  const { token, projectId, teamId } = auth(target)
  if (!token || !projectId) {
    return unconfigured(target === 'website'
      ? 'Set VERCEL_PROJECT_ID_WEBSITE (and VERCEL_API_TOKEN_WEBSITE if the marketing site uses a different token/team) to show the website deployment here.'
      : 'Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID to show deployments, build status and domains here.')
  }
  const headers = { Authorization: `Bearer ${token}` }

  const [dep, proj, dom] = await Promise.all([
    fetchJson<{ deployments?: VercelApiDeployment[] }>(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=8${teamQ(teamId)}`, { headers }),
    fetchJson<VercelApiProject>(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}?${teamQ(teamId).slice(1)}`, { headers }),
    fetchJson<{ domains?: VercelApiDomain[] }>(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains?${teamQ(teamId).slice(1)}`, { headers }),
  ])

  if (!dep.ok && dep.status === 403) {
    return errored('Vercel rejected the token (403). Check the token scope and that it can access this project/team.')
  }
  if (!dep.ok) {
    return errored(`Couldn't reach Vercel: ${dep.error ?? 'unknown error'}.`)
  }

  const deployments: VercelDeployment[] = (dep.body?.deployments ?? []).map((d) => ({
    uid: d.uid ?? d.id ?? '',
    state: d.state ?? d.readyState ?? 'UNKNOWN',
    target: d.target ?? null,
    createdAt: d.createdAt ?? d.created ?? null,
    url: d.url ? `https://${d.url}` : null,
    commitMessage: d.meta?.githubCommitMessage ?? d.meta?.gitCommitMessage ?? null,
    branch: d.meta?.githubCommitRef ?? d.meta?.gitBranch ?? null,
  }))
  const latestProduction = deployments.find((d) => d.target === 'production') ?? null
  const domains = (dom.body?.domains ?? []).map((x) => ({ name: x.name, verified: !!x.verified }))
  const projectName = proj.ok ? (proj.body?.name ?? null) : null

  const anyPartial = !proj.ok || !dom.ok
  const payload = { projectName, deployments, domains, latestProduction }
  return anyPartial
    ? degraded(payload, 'Deployments loaded; some project/domain details were unavailable.')
    : ok(payload)
}
