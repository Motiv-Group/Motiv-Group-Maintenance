import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'
import { isValidEmail } from '@/lib/csv'
import { parseJsonBody } from '@/lib/validate'
import { z } from 'zod'

// Send our OWN branded password-reset email (from EMAIL_FROM via Resend) instead
// of Supabase's default mailer: generate a recovery link server-side, then email
// it ourselves. Always returns { ok: true } so it never reveals whether an
// account exists for the address.
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, z.object({ email: z.any().optional() }))
  if (!parsed.ok) return parsed.error
  const email = String(parsed.data.email ?? '').trim().toLowerCase()
  const ok = NextResponse.json({ ok: true })

  if (!isValidEmail(email)) return ok
  // Cap per-address so the endpoint can't be used to spam an inbox.
  if (!(await rateLimit(`forgot:${email}`, 5, 15 * 60_000))) return ok

  const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, '')
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${base}/auth/reset-password` },
  } as any)
  const link = (data?.properties as any)?.action_link as string | undefined
  if (error || !link) {
    // Server-side only (never leaked to the client) — helps diagnose delivery.
    console.error('[forgot-password] generateLink failed', { email, error: error?.message, hasLink: !!link })
    return ok
  }
  const sent = await sendEmail({ to: email, subject: 'Reset your MOTIV password', html: passwordResetEmailHtml(link, base) })
  if (!sent) console.error('[forgot-password] sendEmail returned false (Resend not configured or rejected)', { email })
  return ok
}
