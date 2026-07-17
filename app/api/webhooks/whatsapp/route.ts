import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { handleWebhook, type WaPayload } from '@/lib/whatsapp/session';

// Re-exported for unit tests (pure functions live in lib/whatsapp/extract.ts).
export { sanitiseExtracted, impactToPriority } from '@/lib/whatsapp/extract';

// ─── ENV ────────────────────────────────────────────────────────────────────
const WA_APP_SECRET   = process.env.WHATSAPP_APP_SECRET;   // Meta App Secret — signs x-hub-signature-256
const WA_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

// ─── GET — Meta webhook verification ────────────────────────────────────────
/** Constant-time string compare (avoids leaking length/content via timing). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify Meta's `x-hub-signature-256` HMAC over the RAW request body.
 * Fail-CLOSED whenever WHATSAPP_APP_SECRET is set, and always in production: a
 * missing secret must never silently disable signature verification once the
 * endpoint is public (audit HIGH 3). Fail-open (with a loud warning) is allowed
 * only OUTSIDE production, so local/dev keeps working until the Meta secret is
 * added — it MUST be set before a public launch.
 */
function verifyWebhookSignature(rawBody: string, header: string | null): boolean {
  if (!WA_APP_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[WhatsApp] WHATSAPP_APP_SECRET not set in production — rejecting webhook (fail-closed).');
      return false;
    }
    console.warn('[WhatsApp] WHATSAPP_APP_SECRET not set — skipping signature verification (dev only; set it before production).');
    return true;
  }
  if (!header) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', WA_APP_SECRET).update(rawBody).digest('hex');
  return safeEqual(header, expected);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && WA_VERIFY_TOKEN && token && safeEqual(token, WA_VERIFY_TOKEN)) {
    console.log('[WhatsApp] Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp] Webhook verification failed — token mismatch or wrong mode');
  return new NextResponse('Forbidden', { status: 403 });
}

// ─── POST — Incoming messages ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // Read the RAW body first — HMAC must be computed over the exact bytes Meta signed.
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    console.warn('[WhatsApp] Rejected webhook — invalid or missing x-hub-signature-256');
    return new NextResponse('Forbidden', { status: 403 });
  }

  let payload: WaPayload;
  try {
    payload = JSON.parse(rawBody) as WaPayload;
  } catch {
    return new NextResponse('Bad Request', { status: 400 });
  }

  await handleWebhook(payload);
  return NextResponse.json({ status: 'ok' });
}
