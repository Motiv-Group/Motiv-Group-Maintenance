import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendWhatsAppText } from '@/lib/whatsapp'
import { z } from 'zod'
import { parseJsonBody } from '@/lib/validate'

const BodySchema = z.object({ text: z.string().optional() })

// POST /api/briefing/whatsapp — send the current briefing text to the
// signed-in user's own WhatsApp number. Recipient is resolved server-side from
// the user's profile (you can only send to yourself), and rate-limited.
//
// Free-form WhatsApp text only delivers inside the 24-hour window (the user must
// have messaged the business number recently) — otherwise Meta rejects it.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(await rateLimit(`briefing-wa:${user.id}`, 5, 60_000))) return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })

  const parsed = await parseJsonBody(request, BodySchema)
  if (!parsed.ok) return parsed.error
  const body = parsed.data
  const { text } = body
  if (typeof text !== 'string' || !text.trim()) return NextResponse.json({ error: 'No briefing text.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: profile } = await admin.from('user_profiles').select('phone, last_wa_inbound_at').eq('id', user.id).single()
  const phone = (profile?.phone ?? '').trim()
  if (!phone) return NextResponse.json({ error: 'No phone number on your profile — add one in Settings.' }, { status: 400 })

  // Never initiate outside the 24h window — protects the business number from
  // being flagged/banned. The user must have messaged the Motiv WhatsApp first.
  const last = profile?.last_wa_inbound_at ? new Date(profile.last_wa_inbound_at).getTime() : 0
  if (Date.now() - last > 24 * 60 * 60 * 1000) {
    return NextResponse.json({
      error: "Send 'hi' to the Motiv WhatsApp number first, then try again — we can only message you within 24h of your message.",
      needsOptIn: true,
    }, { status: 409 })
  }

  const ok = await sendWhatsAppText(phone, text.slice(0, 1000))
  if (!ok) return NextResponse.json({ error: "Couldn't send — please message the Motiv WhatsApp number, then try again." }, { status: 502 })

  return NextResponse.json({ ok: true })
}
