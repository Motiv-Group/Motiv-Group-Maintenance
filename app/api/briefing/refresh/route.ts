import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { serverError } from '@/lib/api-error'
import { rateLimit } from '@/lib/rate-limit'

// POST /api/briefing/refresh — bust today's cached briefing for the caller's
// scope so the next dashboard render regenerates a fresh one (one Groq call).
// Deleting a cache row is low-risk; we still bind company_id to the signed-in
// user and rate-limit to avoid hammering the LLM.
const SCOPES = new Set(['store', 'region', 'supplier', 'estate'])

export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`briefing-refresh:${user.id}`, 5, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { scope, scopeId } = await request.json().catch(() => ({}))
  if (!SCOPES.has(scope) || typeof scopeId !== 'string' || !scopeId) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company on account' }, { status: 403 })

  const date = new Date().toISOString().slice(0, 10)
  const { error } = await admin.from('daily_briefings').delete()
    .eq('company_id', profile.company_id).eq('scope', scope).eq('scope_id', scopeId).eq('briefing_date', date)
  if (error) return serverError(error)

  return NextResponse.json({ ok: true })
}
