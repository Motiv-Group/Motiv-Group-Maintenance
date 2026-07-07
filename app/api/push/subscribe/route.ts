import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const PostBodySchema = z.object({
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
})

const DeleteBodySchema = z.object({
  endpoint: z.string(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`push-sub:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, PostBodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { endpoint, p256dh, auth } = body
  if (!endpoint || !p256dh || !auth)
    return NextResponse.json({ error: 'Missing subscription fields' }, { status: 400 })

  const db = createAdminClient()
  await db.from('push_subscriptions').upsert(
    { user_id: user.id, endpoint, p256dh, auth },
    { onConflict: 'user_id, endpoint' }
  )

  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`push-sub:${user.id}`, 30, 60_000))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const parsed = await parseJsonBody(request, DeleteBodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { endpoint } = body
  if (!endpoint) return NextResponse.json({ error: 'Missing endpoint' }, { status: 400 })

  const db = createAdminClient()
  await db.from('push_subscriptions').delete()
    .eq('user_id', user.id)
    .eq('endpoint', endpoint)

  return NextResponse.json({ success: true })
}
