import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validate'
import { verifyAccountToken } from '@/lib/auth-token'
import { z } from 'zod'

// Set a password from an invite/reset link. The account is identified ONLY by our
// signed token (uid + expiry, HMAC'd) — no browser session, no Supabase OTP. So it
// can only ever set the password of the account named by the token; a logged-in
// admin can never be hit.
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, z.object({ t: z.any().optional(), password: z.any().optional() }))
  if (!parsed.ok) return parsed.error
  const t = String(parsed.data.t ?? '')
  const password = String(parsed.data.password ?? '')

  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  if (!(await rateLimit(`set-password:${t.slice(0, 32)}`, 10, 15 * 60_000))) {
    return NextResponse.json({ error: 'Too many attempts — try again shortly.' }, { status: 429 })
  }

  const verified = verifyAccountToken(t, Date.now())
  if (!verified) return NextResponse.json({ error: 'Your link has expired or is invalid. Request a new one.' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.updateUserById(verified.userId, { password, email_confirm: true })
  if (error || !data?.user) return NextResponse.json({ error: error?.message ?? 'Could not set your password.' }, { status: 400 })

  // Stamp when the password was set so the confirm link becomes one-time: a later
  // GET on the same link sees password_set_at >= the link's issue time and sends
  // the user to login instead of the set-password form again.
  await admin.from('user_profiles').update({ password_set_at: new Date().toISOString() }).eq('id', verified.userId)

  return NextResponse.json({ ok: true, email: data.user.email })
}
