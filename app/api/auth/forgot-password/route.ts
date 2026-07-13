import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendEmail, passwordResetEmailHtml } from '@/lib/email'
import { isValidEmail } from '@/lib/csv'
import { parseJsonBody } from '@/lib/validate'
import { signAccountToken } from '@/lib/auth-token'
import { z } from 'zod'

// Send our OWN branded password-reset email (from EMAIL_FROM via Resend). The link
// carries a signed token (uid + expiry) to our confirm page, which sets the
// password server-side — no Supabase OTP/session. Always returns { ok: true } so
// it never reveals whether an account exists for the address.
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
  // Find the account for this address (email is stored lowercased on the profile).
  const { data: prof } = await admin.from('user_profiles').select('id').eq('email', email).maybeSingle()
  if (!(prof as any)?.id) return ok // unknown address — say nothing

  const link = `${base}/auth/confirm?t=${signAccountToken((prof as any).id, Date.now())}&type=recovery`
  const sent = await sendEmail({ to: email, subject: 'Reset your MOTIV password', html: passwordResetEmailHtml(link, base) })
  if (!sent) console.error('[forgot-password] sendEmail returned false (Resend not configured or rejected)', { email })
  return ok
}
