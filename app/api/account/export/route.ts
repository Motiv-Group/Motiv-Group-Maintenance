import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { serverError } from '@/lib/api-error'

export const dynamic = 'force-dynamic'

/**
 * POPIA / DSAR — "download my data".
 * Returns the personal data Motiv holds for the authenticated user as a JSON
 * download. Read-only. Scoped strictly to the caller's own id.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  if (!(await rateLimit(`account-export:${user.id}`, 5, 60_000))) {
    return NextResponse.json({ error: 'Too many requests — please wait a minute.' }, { status: 429 })
  }

  try {
    const admin = createAdminClient()

    const [profile, notifications, tickets, ratings] = await Promise.all([
      admin.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
      admin.from('notifications').select('*').eq('user_id', user.id),
      admin.from('tickets').select('*').eq('created_by', user.id),
      admin.from('ratings').select('*').eq('rated_by', user.id),
    ])

    const payload = {
      exported_at: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      },
      profile: profile.data ?? null,
      notifications: notifications.data ?? [],
      tickets_created: tickets.data ?? [],
      ratings_given: ratings.data ?? [],
    }

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="motiv-data-${user.id}.json"`,
      },
    })
  } catch (e) {
    return serverError(e, 'Could not export your data.')
  }
}
