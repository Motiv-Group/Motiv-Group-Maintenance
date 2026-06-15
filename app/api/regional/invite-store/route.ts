import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { provisionStoreAccount } from '@/lib/provision-store'

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!rateLimit(`invite-store:${user.id}`, 10, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })
  }

  const body = await request.json()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin

  const result = await provisionStoreAccount(
    {
      full_name:    body.full_name,
      email:        body.email,
      phone:        body.phone,
      address:      body.address,
      company_name: body.company_name,
      sub_store:    body.sub_store,
      branch_code:  body.branch_code,
      password:     body.password,
    },
    { id: user.id, full_name: profile.full_name },
    appUrl,
  )

  if (!result.ok) {
    // Duplicate-ish reasons map to 409, everything else 400
    const status = /already|in use/i.test(result.reason ?? '') ? 409 : 400
    return NextResponse.json({ error: result.reason }, { status })
  }

  return NextResponse.json({
    success:      true,
    store:        { company_name: body.company_name?.trim(), sub_store: body.sub_store?.trim() },
    loginUrl:     `${appUrl.replace(/\/$/, '')}/auth/login`,
    emailSent:    result.emailSent,
    whatsappSent: result.whatsappSent,
    phoneE164:    result.phoneE164,
    shareText:    result.inviteText,
  })
}
