import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendWhatsAppText } from '@/lib/whatsapp'

// POST /api/briefing/whatsapp — send the current briefing text to the
// signed-in user's own WhatsApp number. Recipient is resolved server-side from
// the user's profile (you can only send to yourself), and rate-limited.
//
// Free-form WhatsApp text only delivers inside the 24-hour window (the user must
// have messaged the business number recently) — otherwise Meta rejects it.
export async function POST(request: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!rateLimit(`briefing-wa:${user.id}`, 5, 60_000)) return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })

  const { text } = await request.json().catch(() => ({}))
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'No briefing text.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('phone').eq('id', user.id).single()
  const phone = (profile?.phone ?? '').trim()
  if (!phone) return NextResponse.json({ error: 'No phone number on your profile — add one in Settings.' }, { status: 400 })

  const ok = await sendWhatsAppText(phone, text.slice(0, 1000))
  if (!ok) return NextResponse.json({ error: "Couldn't send — WhatsApp only delivers if you messaged the Motiv number in the last 24h." }, { status: 502 })

  return NextResponse.json({ ok: true })
}
