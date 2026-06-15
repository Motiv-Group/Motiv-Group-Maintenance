import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { generatePassword } from '@/lib/csv'
import { provisionStoreAccount } from '@/lib/provision-store'

interface RowResult {
  email:  string
  status: 'created' | 'skipped' | 'error'
  reason?: string
}

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!rateLimit(`invite-store-bulk:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })
  }

  const { rows } = await request.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }
  if (rows.length > 200) {
    return NextResponse.json({ error: 'Maximum 200 accounts per upload' }, { status: 400 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  const rm = { id: user.id, full_name: profile.full_name }

  const results: RowResult[] = []
  const seenEmails  = new Set<string>()
  const seenCodes   = new Set<string>()

  // Sequential to keep ordering deterministic and avoid hammering the auth API.
  for (const raw of rows) {
    const email = (raw.email ?? '').trim().toLowerCase()
    const code  = (raw.branch_code ?? '').trim().toUpperCase()

    if (!email) { results.push({ email: '(blank)', status: 'skipped', reason: 'Missing email' }); continue }
    if (seenEmails.has(email)) { results.push({ email, status: 'skipped', reason: 'Duplicate email in file' }); continue }
    if (code && seenCodes.has(code)) { results.push({ email, status: 'skipped', reason: 'Duplicate branch code in file' }); continue }
    seenEmails.add(email)
    if (code) seenCodes.add(code)

    const result = await provisionStoreAccount(
      {
        full_name:    raw.full_name,
        email,
        phone:        raw.phone,
        address:      raw.address,
        company_name: raw.company_name,
        sub_store:    raw.sub_store,
        branch_code:  code,
        password:     (raw.password ?? '').trim() || generatePassword(),
      },
      rm,
      appUrl,
    )

    results.push(
      result.ok
        ? { email, status: 'created' }
        : { email, status: 'error', reason: result.reason },
    )
  }

  const created = results.filter(r => r.status === 'created').length
  const skipped = results.filter(r => r.status !== 'created').length

  return NextResponse.json({ created, skipped, results }, { status: 201 })
}
