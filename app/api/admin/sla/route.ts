import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { rateLimit } from '@/lib/rate-limit'
import { logAudit } from '@/lib/audit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'
import { FALLBACK_SLA } from '@/lib/health/constants'
import type { Priority } from '@/lib/health/types'

// POST /api/admin/sla — system_admin edits the PLATFORM-GLOBAL SLA rules
// (sla_rules rows with company_id NULL). The health engine resolves
// company row → global row → FALLBACK_SLA, so saving here changes every
// company that has no override of its own. Values are minutes.

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4']
// 5 minutes … 4 weeks — wide enough for any sane window, tight enough to stop typos.
const MINS = z.number().int().min(5).max(40320)
const RuleSchema = z.object({
  first_response_mins: MINS,
  attendance_mins: MINS,
  quote_due_mins: MINS,
  resolution_mins: MINS,
  internal_decision_mins: MINS,
})
const BodySchema = z.object({
  rules: z.object({ P1: RuleSchema, P2: RuleSchema, P3: RuleSchema, P4: RuleSchema }),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`admin-sla:${user.id}`, 20, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const { rules } = parsed.data

  // sla_rules has no unique (company_id, priority) index — update the existing
  // global row by id when present, insert otherwise (never create duplicates).
  const { data: existing } = await admin.from('sla_rules').select('id, priority').is('company_id', null)
  const now = new Date().toISOString()
  for (const p of PRIORITIES) {
    const r = rules[p]
    const row = (existing ?? []).find(e => e.priority === p)
    if (row) {
      const { error } = await admin.from('sla_rules').update({ ...r, updated_at: now }).eq('id', row.id)
      if (error) return NextResponse.json({ error: `Could not save ${p}: ${error.message}` }, { status: 500 })
    } else {
      const { error } = await admin.from('sla_rules').insert({ company_id: null, priority: p, ...r })
      if (error) return NextResponse.json({ error: `Could not save ${p}: ${error.message}` }, { status: 500 })
    }
  }

  await logAudit(admin, {
    actorId: user.id, action: 'admin.sla_rules_save', entityType: 'sla_rules', entityId: 'global',
    metadata: { rules },
  })
  // Dashboards compute live from these rules — refresh every role's pages.
  revalidatePath('/', 'layout')
  return NextResponse.json({ ok: true })
}

// GET — the effective global rules (saved rows merged over the hardcoded fallback).
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  const admin = createAdminClient()
  const { data: me } = await admin.from('user_profiles').select('role').eq('id', user.id).single()
  if (me?.role !== 'system_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await admin.from('sla_rules').select('*').is('company_id', null)
  const rules = Object.fromEntries(PRIORITIES.map(p => {
    const r = (data ?? []).find(x => x.priority === p)
    const f = FALLBACK_SLA[p]
    return [p, {
      first_response_mins: r?.first_response_mins ?? f.first_response_mins,
      attendance_mins: r?.attendance_mins ?? f.attendance_mins,
      quote_due_mins: r?.quote_due_mins ?? f.quote_due_mins,
      resolution_mins: r?.resolution_mins ?? f.resolution_mins,
      internal_decision_mins: r?.internal_decision_mins ?? f.internal_decision_mins,
      saved: !!r,
    }]
  }))
  return NextResponse.json({ rules })
}
