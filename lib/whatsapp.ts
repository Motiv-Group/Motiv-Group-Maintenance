// WhatsApp Cloud API text sender. Mirrors lib/push.ts / lib/email.ts: no-ops
// (returns false) without config and never throws.
//
// NOTE: the Cloud API only delivers free-form text inside the 24-hour
// customer-care window (i.e. the recipient messaged the business number
// recently). A cold, business-initiated message requires a pre-approved
// message template — not set up here. So treat this as best-effort and always
// offer a manual share fallback (wa.me link) in the UI.

import { fetchWithRetry } from '@/lib/fetch-retry'

/**
 * Send a plain WhatsApp text message. `to` may be any phone format; it's
 * reduced to digits (Cloud API expects no leading +). Returns true on a 2xx,
 * false otherwise. Never throws. Timeout + one retry so a hung Graph call
 * can't stall the caller.
 */
export async function sendWhatsAppText(to: string, body: string): Promise<boolean> {
  const token   = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneId) return false

  const digits = to.replace(/\D/g, '')
  if (!digits) return false

  try {
    const res = await fetchWithRetry(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: digits,
        type: 'text',
        text: { body },
      }),
    }, { timeoutMs: 15_000, retries: 1, label: 'wa-send:text' })
    return res.ok
  } catch {
    return false
  }
}
