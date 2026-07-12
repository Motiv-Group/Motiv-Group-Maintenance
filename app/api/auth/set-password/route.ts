import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validate'
import { z } from 'zod'

// Set the password for an invited/recovering user via the ADMIN API — the same
// mechanism as a dashboard-created user, which reliably works at login. The
// client-side updateUser() on a recovery session was producing accounts that
// couldn't sign in; this replaces it. Auth is the invite/recovery access token
// (only its holder can set that user's password).
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, z.object({ accessToken: z.any().optional(), password: z.any().optional() }))
  if (!parsed.ok) return parsed.error
  const accessToken = String(parsed.data.accessToken ?? '')
  const password = String(parsed.data.password ?? '')

  if (!accessToken) return NextResponse.json({ error: 'Your link has expired or is invalid. Request a new one.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  if (!(await rateLimit(`set-password:${accessToken.slice(0, 32)}`, 10, 15 * 60_000))) {
    return NextResponse.json({ error: 'Too many attempts — try again shortly.' }, { status: 429 })
  }

  const admin = createAdminClient()
  // Validate the token → the user it belongs to.
  const { data: userData, error: getErr } = await admin.auth.getUser(accessToken)
  if (getErr || !userData?.user) {
    return NextResponse.json({ error: 'Your link has expired or is invalid. Request a new one.' }, { status: 401 })
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(userData.user.id, { password, email_confirm: true })
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
