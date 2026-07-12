import { createClient as createSbClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { parseJsonBody } from '@/lib/validate'
import { z } from 'zod'

// Set the password for an invited/recovering user, keyed ONLY to the one-time
// token from the email link — never a browser session. So it can only ever set
// the password of the account the token names; a logged-in admin can't be hit.
//   1) verifyOtp(token_hash) on a session-less anon client → the token's user
//   2) admin.updateUserById → set the password (the path that works at login)
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, z.object({ tokenHash: z.any().optional(), type: z.any().optional(), password: z.any().optional() }))
  if (!parsed.ok) return parsed.error
  const tokenHash = String(parsed.data.tokenHash ?? '')
  const type: 'invite' | 'recovery' = String(parsed.data.type ?? 'invite') === 'recovery' ? 'recovery' : 'invite'
  const password = String(parsed.data.password ?? '')

  if (!tokenHash) return NextResponse.json({ error: 'Your link has expired or is invalid. Request a new one.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  if (!(await rateLimit(`set-password:${tokenHash.slice(0, 32)}`, 10, 15 * 60_000))) {
    return NextResponse.json({ error: 'Too many attempts — try again shortly.' }, { status: 429 })
  }

  // Session-less client purely to verify the one-time token → its user.
  const sb = createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )
  const { data, error: vErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type })
  if (vErr || !data?.user) {
    return NextResponse.json({ error: 'Your link has expired or was already used. Request a new one.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { error: updErr } = await admin.auth.admin.updateUserById(data.user.id, { password, email_confirm: true })
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, email: data.user.email })
}
