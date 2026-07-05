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

function auth() {
  const token = process.env.VERCEL_API_TOKEN
  const projectId = process.env.VERCEL_PROJECT_ID
  const teamId = process.env.VERCEL_TEAM_ID
  return { token, projectId, teamId }
}
function teamQ(teamId?: string) { return teamId ? `&teamId=${encodeURIComponent(teamId)}` : '' }

export async function getVercelStats(): Promise<ProviderResult<VercelStats>> {
  const { token, projectId, teamId } = auth()
  if (!token || !projectId) {
    return unconfigured('Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID to show deployments, build status and domains here.')
  }
  const headers = { Authorization: `Bearer ${token}` }

  const [dep, proj, dom] = await Promise.all([
    fetchJson<any>(`https://api.vercel.com/v6/deployments?projectId=${encodeURIComponent(projectId)}&limit=8${teamQ(teamId)}`, { headers }),
    fetchJson<any>(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}?${teamQ(teamId).slice(1)}`, { headers }),
    fetchJson<any>(`https://api.vercel.com/v9/projects/${encodeURIComponent(projectId)}/domains?${teamQ(teamId).slice(1)}`, { headers }),
  ])

  if (!dep.ok && dep.status === 403) {
    return errored('Vercel rejected the token (403). Check the token scope and that it can access this project/team.')
  }
  if (!dep.ok) {
    return errored(`Couldn't reach Vercel: ${dep.error ?? 'unknown error'}.`)
  }

  const deployments: VercelDeployment[] = ((dep.body?.deployments ?? []) as any[]).map((d) => ({
    uid: d.uid ?? d.id ?? '',
    state: d.state ?? d.readyState ?? 'UNKNOWN',
    target: d.target ?? null,
    createdAt: d.createdAt ?? d.created ?? null,
    url: d.url ? `https://${d.url}` : null,
    commitMessage: d.meta?.githubCommitMessage ?? d.meta?.gitCommitMessage ?? null,
    branch: d.meta?.githubCommitRef ?? d.meta?.gitBranch ?? null,
  }))
  const latestProduction = deployments.find((d) => d.target === 'production') ?? null
  const domains = ((dom.body?.domains ?? []) as any[]).map((x) => ({ name: x.name, verified: !!x.verified }))
  const projectName = proj.ok ? (proj.body?.name ?? null) : null

  const anyPartial = !proj.ok || !dom.ok
  const payload = { projectName, deployments, domains, latestProduction }
  return anyPartial
    ? degraded(payload, 'Deployments loaded; some project/domain details were unavailable.')
    : ok(payload)
}
