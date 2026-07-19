import 'server-only'
import crypto from 'crypto'

// Stateless HMAC-signed token binding a user id to an expiry. Used for invite /
// password-reset links so setting a password depends ONLY on possessing the
// emailed token — no DB row, no Supabase OTP/verify, no browser session. Signed
// with the service-role key (server-only secret).
const SECRET = () => process.env.SUPABASE_SERVICE_ROLE_KEY || 'motiv-insecure-fallback'
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000 // ~1 month

export function signAccountToken(userId: string, now: number, ttlMs = DEFAULT_TTL_MS): string {
  const payload = `${userId}.${now + ttlMs}`
  const sig = crypto.createHmac('sha256', SECRET()).update(payload).digest('base64url')
  return `${Buffer.from(payload).toString('base64url')}.${sig}`
}

export interface VerifiedToken {
  userId: string
  /** When the link was issued (= expiry − default TTL, since every issuer uses it).
   *  Used to tell a spent link from a fresh one: a password set at/after this time
   *  means this token (or a newer one) already activated the account. */
  issuedAt: number
}

/** Returns the user id + issue time if the token is authentic and unexpired, else null. */
export function verifyAccountToken(token: string, now: number): VerifiedToken | null {
  const [b64, sig] = (token || '').split('.')
  if (!b64 || !sig) return null
  let payload: string
  try { payload = Buffer.from(b64, 'base64url').toString('utf8') } catch { return null }
  const expected = crypto.createHmac('sha256', SECRET()).update(payload).digest('base64url')
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  const [userId, expStr] = payload.split('.')
  if (!userId || !expStr || now > Number(expStr)) return null
  return { userId, issuedAt: Number(expStr) - DEFAULT_TTL_MS }
}
