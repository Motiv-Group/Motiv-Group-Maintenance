// Server-side Cloudflare Turnstile verification (OPS-003). Used by routes that
// create accounts via the service-role admin API (e.g. supplier self-signup),
// which bypasses Supabase's own built-in CAPTCHA check — so we must verify the
// token ourselves against Cloudflare's siteverify endpoint.
//
// No-ops (returns true) when TURNSTILE_SECRET_KEY is unset, so nothing breaks
// before the owner configures CAPTCHA. Enforcement turns on the moment the key
// is set — flip it together with NEXT_PUBLIC_TURNSTILE_SITE_KEY on the client.

const SECRET = process.env.TURNSTILE_SECRET_KEY

/** True when server-side Turnstile verification is configured. */
export function turnstileConfigured(): boolean {
  return !!SECRET
}

/**
 * Verify a Turnstile token. Returns true when not configured (no-op) or when the
 * token is valid; false only when configured AND the token is missing/invalid.
 */
export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  if (!SECRET) return true // not configured → don't block
  if (!token) return false

  try {
    const form = new URLSearchParams()
    form.set('secret', SECRET)
    form.set('response', token)
    if (ip) form.set('remoteip', ip)

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(8000),
    })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch {
    // A Cloudflare outage must not lock out signups — fail open (the widget on the
    // client is still a real barrier to casual abuse). Log-worthy but non-fatal.
    return true
  }
}
