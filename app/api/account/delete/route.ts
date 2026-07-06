import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { serverError } from '@/lib/api-error'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({ confirm: z.string().optional() })

/**
 * POPIA — account deletion / right to erasure.
 *
 * We ANONYMISE personal data rather than hard-deleting the auth row: the account
 * id is a foreign key on operational records (tickets, quotes, completions) that
 * Motiv retains under legitimate business interest, so cascading a delete would
 * corrupt that history. Instead we scrub the PII fields, deactivate the profile,
 * scramble the login email, and ban the auth user so they can no longer sign in.
 * This is irreversible — the client must send { confirm: "DELETE" }.
 */
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!(await rateLimit(`account-delete:${user.id}`, 3, 60_000))) {
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  }

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  if (body.confirm !== 'DELETE') {
    return NextResponse.json({ error: 'Confirmation phrase required.' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()

    // 1. Anonymise the profile PII (base columns present on every deployment).
    const { error: profileErr } = await admin
      .from('user_profiles')
      .update({ full_name: 'Deleted user', email: null, phone: null, active: false })
      .eq('id', user.id)
    if (profileErr) return serverError(profileErr, 'Could not delete your account.')
    await logAudit(admin, { actorId: user.id, action: 'account.self_delete', entityType: 'user', entityId: user.id })

    // 2. Scramble the auth login email + ban the user so they can no longer sign in.
    //    Best-effort — a failure here still leaves the profile anonymised above.
    try {
      await admin.auth.admin.updateUserById(user.id, {
        email: `deleted+${user.id}@motiv.invalid`,
        ban_duration: '876000h', // ~100 years
        user_metadata: { deleted: true },
      })
    } catch (banErr) {
      console.error('[account-delete] auth scrub/ban failed', banErr)
    }

    // 3. Remove push subscriptions so we stop contacting the device.
    await admin.from('push_subscriptions').delete().eq('user_id', user.id)

    // 4. Revoke ALL of the user's sessions (every device), not just this one, so no
    //    refresh token survives. NOTE: a stateless access token (JWT) already issued
    //    stays valid until it expires (~1h) — that window is inherent to JWTs; the ban
    //    above + global sign-out prevent any new/refreshed token after it.
    await supabase.auth.signOut({ scope: 'global' })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return serverError(e, 'Could not delete your account.')
  }
}
