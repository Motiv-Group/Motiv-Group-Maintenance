import 'server-only'
import { fetchJson } from './http'
import { ok, degraded, unconfigured, errored, type ProviderResult } from './types'

export interface ResendDomain {
  name: string
  status: string          // verified | pending | not_started | failure | ...
  region: string | null
  createdAt: string | null
}
export interface ResendStats {
  fromAddress: string | null   // EMAIL_FROM
  domains: ResendDomain[]
  apiKeyCount: number | null
}

// Minimal shape of a Resend domain payload (only the fields read below).
interface ResendApiDomain {
  name: string
  status?: string
  region?: string | null
  created_at?: string | null
}

export async function getResendStats(): Promise<ProviderResult<ResendStats>> {
  const key = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM ?? null
  if (!key) {
    return unconfigured('Set RESEND_API_KEY (and EMAIL_FROM) to show sending domains and delivery config here.')
  }
  const headers = { Authorization: `Bearer ${key}` }

  const [domainsRes, keysRes] = await Promise.all([
    fetchJson<{ data?: ResendApiDomain[] }>('https://api.resend.com/domains', { headers }),
    fetchJson<{ data?: unknown[] }>('https://api.resend.com/api-keys', { headers }),
  ])

  if (!domainsRes.ok && (domainsRes.status === 401 || domainsRes.status === 403)) {
    return errored('Resend rejected the API key (auth failed). Rotate/verify RESEND_API_KEY.')
  }
  if (!domainsRes.ok) {
    return errored(`Couldn't reach Resend: ${domainsRes.error ?? 'unknown error'}.`)
  }

  // Resend returns { data: [...] } for list endpoints; tolerate a raw array body
  // (older API shapes) — hence the narrow list casts on the ?? fallback chains.
  const domains: ResendDomain[] = ((domainsRes.body?.data ?? domainsRes.body ?? []) as ResendApiDomain[]).map((d) => ({
    name: d.name,
    status: d.status ?? 'unknown',
    region: d.region ?? null,
    createdAt: d.created_at ?? null,
  }))
  const apiKeyCount = keysRes.ok ? ((keysRes.body?.data ?? keysRes.body ?? []) as unknown[]).length : null

  const payload = { fromAddress: from, domains, apiKeyCount }
  if (!from) return degraded(payload, 'RESEND_API_KEY is set but EMAIL_FROM is not — outgoing email will no-op until both are configured.')
  return ok(payload)
}
