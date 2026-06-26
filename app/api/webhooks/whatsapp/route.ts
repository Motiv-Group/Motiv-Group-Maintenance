import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendPushToMany } from '@/lib/push';
import { OPERATIONAL_IMPACT_LABELS } from '@/lib/utils';
import type { Priority } from '@/lib/types';
import { getBriefingForUser } from '@/lib/briefing/generate';
import { briefingToText } from '@/lib/briefing/facts';
import https from 'https';

// ─── ENV ────────────────────────────────────────────────────────────────────
const WA_TOKEN       = process.env.WHATSAPP_ACCESS_TOKEN!;
const WA_PHONE_ID    = process.env.WHATSAPP_PHONE_NUMBER_ID!;
const GROQ_API_KEY  = process.env.GROQ_API_KEY!;
const GROQ_BASE     = 'https://api.groq.com/openai/v1';
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const MIN_PHOTOS = 2;
const MAX_PHOTOS = 5;

// ─── Types ───────────────────────────────────────────────────────────────────
interface WaMessage {
  from: string;
  type: string;
  audio?:       { id: string };
  text?:        { body: string };
  image?:       { id: string; mime_type: string };
  interactive?: { type?: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
}

interface WaPayload {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        metadata: { phone_number_id: string };
        messages?: WaMessage[];
      };
    }>;
  }>;
}

// Must mirror the web "Log a Ticket" form options exactly.
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'General', 'Cleaning', 'Other'] as const;
const IMPACTS = ['none', 'cosmetic', 'customer_visible', 'staff_inconvenience', 'trading_affected', 'safety_risk', 'cannot_trade'] as const;
type Category = typeof CATEGORIES[number];
type OpImpact = typeof IMPACTS[number];

// Below this the AI is treated as unsure → warn the manager + flag for RM review.
const CONFIDENCE_THRESHOLD = 0.6;

interface ExtractedTicket {
  title: string;
  description: string;
  priority: Priority;
  category: Category;
  operational_impact: OpImpact;
  confidence: number;
  is_issue: boolean;
}

interface WaSession {
  id: string;
  title: string;
  description: string;
  priority: string;
  category: string;
  operational_impact: string;
  confidence?: number | null;
  pending_field?: string | null;
  photo_urls: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalisePhone(from: string): string {
  const digits = from.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return `+27${digits.slice(1)}`;
  return `+${digits}`;
}

/** Download a Meta media file as an ArrayBuffer */
async function downloadMedia(mediaId: string): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }> {
  const metaRes = await fetch(
    `https://graph.facebook.com/v21.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } }
  );
  if (!metaRes.ok) throw new Error(`Meta media lookup failed: ${metaRes.status}`);
  const { url, mime_type } = await metaRes.json() as { url: string; mime_type: string };

  // Use Node https — undici has a known TLS socket issue with Meta's CDN
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` } }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`Media download failed: ${res.statusCode}`));
        res.resume();
        return;
      }
      const chunks: Uint8Array[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));
      res.on('end', () => {
        const total  = chunks.reduce((n, c) => n + c.length, 0);
        const merged = new Uint8Array(total);
        let offset   = 0;
        for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
        resolve(merged.buffer);
      });
      res.on('error', reject);
    }).on('error', reject);
  });

  return { arrayBuffer, mimeType: mime_type };
}

// Biases Whisper toward a South African accent + the Afrikaans/English code-
// switching common in SA retail, so the transcript spelling is accurate.
// (Whisper uses this as vocabulary/style context, not an instruction.)
const WHISPER_PROMPT =
  'South African English, often mixed with Afrikaans, describing a retail store maintenance problem. ' +
  'Common terms: aircon, geyser, load shedding, koelkas, vrieskas, lekkasie, krag, stukkend, deur, ligte, plafon, drein, toilet, pyp, muur, dak.';

const TICKET_EXTRACTION_PROMPT = `You are a maintenance ticket assistant for a South African retail maintenance platform.
The input is a store manager describing a maintenance problem, in South African English, Afrikaans, or a mix of both (code-switching). It may contain transcription errors from a voice note.

Return ONLY a valid JSON object with these EXACT keys:
- "title": a short, professional one-line summary in ENGLISH (max 80 chars). No slang, no Afrikaans.
- "description": a clear, professional description in ENGLISH — what is broken, where, and any impact mentioned. Translate any Afrikaans to English and write full sentences. Do NOT invent details that were not said.
- "category": the single most appropriate value, EXACTLY one of: Electrical, Plumbing, HVAC, Refrigeration, Gas, Structural, General, Cleaning, Other.
- "operational_impact": the single most appropriate value, EXACTLY one of: none, cosmetic, customer_visible, staff_inconvenience, trading_affected, safety_risk, cannot_trade.
- "priority": one of low, medium, high, urgent.
- "confidence": a number from 0 to 1 — how confident you are that the category, impact and details are correct. Use a LOW value when the input was vague, very short, off-topic, or hard to transcribe; a HIGH value only when the issue is clearly described.
- "is_issue": true ONLY if the message describes (or clearly is) a maintenance/facilities problem to log (something broken, leaking, not working, unsafe, etc.). Set false for greetings, small talk, thanks, questions, commands like "menu"/"help"/"briefing", or anything that is NOT a maintenance problem.

Category guide: HVAC = aircon/heating/ventilation; Refrigeration = fridges/freezers/cold rooms; Gas = gas lines/burners; Structural = walls/roof/ceiling/doors/floors; Plumbing = water/leaks/drains/toilets; Cleaning = spills/hygiene; General = anything not clearly another category; Other only if truly none fit.
Operational impact guide: cannot_trade = store cannot operate; safety_risk = danger to people; trading_affected = trading/sales disrupted; customer_visible = customers can see it; staff_inconvenience = affects staff only; cosmetic = minor/appearance; none = no operational impact.
Priority guide: urgent = safety_risk or cannot_trade; high = trading_affected; medium = customer_visible or staff_inconvenience; low = cosmetic or none.

Rules: Always output English. If uncertain, pick the safest reasonable option and prefer "General" / "none" over a wild guess. Never leave a field blank.`;

/** Transcribe audio using Groq Whisper, then extract ticket fields */
async function transcribeAndExtract(arrayBuffer: ArrayBuffer, mimeType: string): Promise<ExtractedTicket> {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'ogg';
  const form = new FormData();
  form.append('file', new Blob([arrayBuffer], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');
  form.append('temperature', '0');
  // Vocabulary/accent bias for SA English + Afrikaans code-switching. Language
  // stays auto-detected so the Afrikaans mix is captured, then the LLM translates.
  form.append('prompt', WHISPER_PROMPT);

  const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Groq transcription failed: ${await res.text()}`);

  const transcript = (await res.text()).trim();
  if (!transcript) throw new Error('Empty transcript');

  return extractTicketFields(transcript);
}

/** Extract ticket fields from plain text using Groq LLaMA */
async function extractTicketFields(text: string): Promise<ExtractedTicket> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
      temperature: 0,
      messages: [
        { role: 'system', content: TICKET_EXTRACTION_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Groq extraction failed: ${await res.text()}`);

  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = JSON.parse(json.choices[0].message.content) as Partial<ExtractedTicket>;

  return sanitiseExtracted(raw, text);
}

function sanitiseExtracted(raw: Partial<ExtractedTicket>, fallbackDescription?: string): ExtractedTicket {
  const validPriorities: Priority[] = ['low', 'medium', 'high', 'urgent'];
  // Constrain free-text model output to our exact enums; fall back safely so a
  // bad/missing value never blocks ticket creation.
  const category: Category = (CATEGORIES as readonly string[]).includes(raw.category as string) ? (raw.category as Category) : 'General';
  const operational_impact: OpImpact = (IMPACTS as readonly string[]).includes(raw.operational_impact as string) ? (raw.operational_impact as OpImpact) : 'none';
  const confidence = typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : 0.5;
  // Default true so a missing flag never silently drops a real ticket.
  const is_issue = typeof raw.is_issue === 'boolean' ? raw.is_issue : true;
  return {
    title:       (raw.title ?? 'Maintenance request').toString().slice(0, 80),
    description: raw.description ?? fallbackDescription ?? 'No description provided',
    priority:    validPriorities.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'medium',
    category,
    operational_impact,
    confidence,
    is_issue,
  };
}

// Operational impact → v3 ticket priority (P1–P4) + severity. Mirrors the
// health engine's derivation so WhatsApp tickets rank like web-form tickets.
type V3Priority = 'P1' | 'P2' | 'P3' | 'P4';
function impactToPriority(impact: OpImpact): { priority: V3Priority; severity: 'low' | 'medium' | 'high' | 'critical' } {
  switch (impact) {
    case 'cannot_trade':
    case 'safety_risk':       return { priority: 'P1', severity: 'critical' };
    case 'trading_affected':  return { priority: 'P2', severity: 'high' };
    case 'customer_visible':
    case 'staff_inconvenience': return { priority: 'P3', severity: 'medium' };
    default:                  return { priority: 'P4', severity: 'low' }; // cosmetic / none
  }
}
const P_EMOJI: Record<V3Priority, string> = { P1: '🔴', P2: '🟠', P3: '🟡', P4: '🟢' };

/** POST a message payload to the WhatsApp Cloud API. Logs Meta's error body on
 *  failure (these were previously swallowed, so rejected interactive messages
 *  looked like "nothing happened"). Returns true on a 2xx. */
async function waPost(payload: object, label: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[WhatsApp] ${label} failed ${res.status}:`, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[WhatsApp] ${label} error:`, err);
    return false;
  }
}

/** Send a WhatsApp text reply */
async function sendWhatsAppReply(to: string, text: string): Promise<boolean> {
  return waPost({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }, 'text');
}

/** Send a WhatsApp interactive button message */
async function sendWhatsAppButton(to: string, bodyText: string, buttonLabel: string, buttonId: string): Promise<boolean> {
  return waPost({
    messaging_product: 'whatsapp', to, type: 'interactive',
    interactive: { type: 'button', body: { text: bodyText }, action: { buttons: [{ type: 'reply', reply: { id: buttonId, title: buttonLabel } }] } },
  }, 'button');
}

/** Send a WhatsApp interactive message with up to 3 reply buttons. */
async function sendWhatsAppButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<boolean> {
  return waPost({
    messaging_product: 'whatsapp', to, type: 'interactive',
    interactive: {
      type: 'button', body: { text: bodyText },
      action: { buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
    },
  }, 'buttons');
}

const PRIORITY_EMOJI: Record<Priority, string> = { low: '🟢', medium: '🟡', high: '🟠', urgent: '🔴' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface DraftView { title: string; description: string; category: string; operational_impact: string; priority: string; confidence?: number | null }

/** Strip the trailing "_Submitted via …_" note from a stored description. */
const cleanDescription = (s: string) => s.replace(/\n\n_Submitted via[\s\S]*$/, '').trim();

/** Show the AI draft + Confirm / Edit buttons so the manager can catch mistakes. */
async function sendDraft(from: string, d: DraftView): Promise<void> {
  const pr = d.priority as Priority;
  const lowConfidence = d.confidence != null && d.confidence < CONFIDENCE_THRESHOLD;
  const body =
    (lowConfidence ? `⚠️ *I wasn't fully sure about this one — please double-check the details below.*\n\n` : ``) +
    `📝 *Please check your ticket:*\n\n` +
    `*Title:* ${d.title}\n` +
    `*Description:* ${d.description}\n` +
    `*Category:* ${d.category}\n` +
    `*Impact:* ${OPERATIONAL_IMPACT_LABELS[d.operational_impact] ?? d.operational_impact}\n` +
    `*Priority:* ${PRIORITY_EMOJI[pr] ?? ''} ${cap(d.priority)}`;
  await sendWhatsAppButtons(from, body, [
    { id: 'confirm_ticket', title: '✅ Looks good' },
    { id: 'edit_ticket',    title: '✏️ Edit' },
  ]);
}

/** Interactive list message (tappable menu) — single section, up to 10 rows. */
async function sendWhatsAppList(to: string, bodyText: string, buttonLabel: string, rows: { id: string; title: string; description?: string }[]): Promise<boolean> {
  return waPost({
    messaging_product: 'whatsapp', to, type: 'interactive',
    interactive: {
      type: 'list', body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections: [{ rows: rows.slice(0, 10).map(r => ({ id: r.id, title: r.title.slice(0, 24), ...(r.description ? { description: r.description.slice(0, 72) } : {}) })) }],
      },
    },
  }, 'list');
}

/** Tap-to-edit: pick which field to change. */
async function sendFieldPicker(from: string): Promise<void> {
  await sendWhatsAppList(from, 'Which detail would you like to change?', 'Choose a field', [
    { id: 'edit_field:category',    title: 'Category' },
    { id: 'edit_field:impact',      title: 'Operational Impact' },
    { id: 'edit_field:priority',    title: 'Priority' },
    { id: 'edit_field:title',       title: 'Title' },
    { id: 'edit_field:description', title: 'Description' },
  ]);
}

/** Extract a draft from a VN or text message (sends a "processing" ack). */
async function extractFromMessage(from: string, message: WaMessage): Promise<ExtractedTicket | null> {
  if (message.type === 'audio') {
    const mediaId = message.audio?.id;
    if (!mediaId) return null;
    await sendWhatsAppReply(from, '🎙️ Voice note received! Processing your request, please hold on...');
    const { arrayBuffer, mimeType } = await downloadMedia(mediaId);
    return transcribeAndExtract(arrayBuffer, mimeType);
  }
  const transcript = (message.text?.body ?? '').trim();
  if (!transcript) return null;
  // No "processing a ticket" ack for text — we don't yet know if it's a ticket.
  // The is_issue check then routes to either the menu or the draft (≈1-2s).
  return extractTicketFields(transcript);
}

/** Upload image buffer to Supabase Storage, return public URL */
async function uploadPhotoToStorage(
  sessionId: string,
  arrayBuffer: ArrayBuffer,
  mimeType: string
): Promise<string> {
  const adminClient = createAdminClient();
  const ext  = mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
  const path = `whatsapp/${sessionId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await adminClient.storage
    .from('ticket-photos')
    .upload(path, new Uint8Array(arrayBuffer), { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  return `${SUPABASE_URL}/storage/v1/object/public/ticket-photos/${path}`;
}

/** Atomically append a photo URL to the session, returns updated array */
async function appendSessionPhoto(
  sessionId: string,
  photoUrl: string,
  adminClient: ReturnType<typeof createAdminClient>
): Promise<string[]> {
  const { data, error } = await adminClient.rpc('append_session_photo', {
    session_id: sessionId,
    photo_url:  photoUrl,
  });
  if (error) throw new Error(`append_session_photo RPC failed: ${error.message}`);
  return (data as string[]) ?? [];
}

/** Notify the store's regional manager(s) + revalidate (v3). Mirrors /api/tickets. */
async function notifyRegion(
  adminClient: ReturnType<typeof createAdminClient>,
  o: { ticketId: string; title: string; priority: string; companyId: string; regionId: string | null; storeName: string; needsReview?: boolean }
): Promise<void> {
  if (o.regionId) {
    const { data: rms } = await adminClient.from('regional_users').select('user_id').eq('region_id', o.regionId);
    const ids = (rms ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length) {
      const reviewHint = o.needsReview ? ' ⚠️ Low AI confidence — please review.' : '';
      await adminClient.from('notifications').insert(ids.map(id => ({
        company_id: o.companyId, user_id: id, type: 'new_ticket', title: 'New Ticket in Your Region',
        message: `${o.storeName} logged a ${o.priority} ticket via WhatsApp: "${o.title}"${reviewHint}`, link: `/regional/tickets/${o.ticketId}`,
      })));
      void sendPushToMany(ids, { title: 'New Ticket', body: `${o.storeName}: ${o.title}`, url: `/regional/tickets/${o.ticketId}` });
    }
  }
  revalidatePath('/client');
  revalidatePath('/regional');
}

// ─── GET — Meta webhook verification ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp] Webhook verification failed — token mismatch or wrong mode');
  return new NextResponse('Forbidden', { status: 403 });
}

// ─── POST — Incoming messages ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const payload = await req.json() as WaPayload;
  await handleWebhook(payload);
  return NextResponse.json({ status: 'ok' });
}

// ─── Greeting / main menu ────────────────────────────────────────────────────
// A casual greeting (or "menu"/"help") shows a role-aware action menu instead of
// being treated as a ticket. Substantive text still flows straight to intake.
const GREETING_RE = /^(hi+|hey+|hallo|hello|halo|howzit|yo+|sup|good\s*(morning|afternoon|evening|day)|goeie\s*(more|môre|middag|naand|dag)|menu|help|start|hi motiv|hello motiv)\b[\s!.,?]*$/i;
function isGreeting(s: string): boolean { return GREETING_RE.test(s.trim()); }

/** Send the role-aware main menu: SMs get Log-a-ticket + Briefing; others get Briefing. */
async function sendMainMenu(from: string, normalisedPhone: string, adminClient: ReturnType<typeof createAdminClient>, bodyText?: string): Promise<void> {
  const { data: profile } = await adminClient.from('user_profiles').select('role, full_name').eq('phone', normalisedPhone).maybeSingle();
  if (!profile) {
    await sendWhatsAppReply(from, '👋 Welcome to Motiv. Your number is not registered yet — please contact your administrator.');
    return;
  }
  const name = (profile.full_name ?? '').split(' ')[0];
  const isSM = profile.role === 'store_manager' || profile.role === 'client';
  const buttons = isSM
    ? [{ id: 'menu_log_ticket', title: 'Log a ticket' }, { id: 'menu_briefing', title: 'Daily briefing' }]
    : [{ id: 'menu_briefing', title: 'Daily briefing' }];
  const body = bodyText ?? `👋 Hi ${name || 'there'}! What would you like to do?`;
  const ok = await sendWhatsAppButtons(from, body, buttons);
  // Fallback if interactive buttons are rejected (keeps the menu usable): a plain
  // text prompt with keyword replies, handled in the text dispatcher.
  if (!ok) {
    const options = isSM
      ? 'Reply *ticket* to log a maintenance issue, or *briefing* for your daily briefing.'
      : 'Reply *briefing* for your daily briefing.';
    await sendWhatsAppReply(from, `${body}\n\n${options}`);
  }
}

/** Build the sender's daily briefing and send it as a WhatsApp message. */
async function sendBriefingViaWhatsApp(from: string, normalisedPhone: string, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  const { data: profile } = await adminClient.from('user_profiles').select('id, role, company_id').eq('phone', normalisedPhone).maybeSingle();
  if (!profile?.company_id) {
    await sendWhatsAppReply(from, '⚠️ Your number is not registered in Motiv. Please contact your administrator.');
    return;
  }
  try {
    const briefing = await getBriefingForUser({ userId: profile.id, role: profile.role, companyId: profile.company_id });
    if (!briefing) {
      await sendWhatsAppReply(from, "I couldn't build your briefing yet — your account may not be linked to a store/region. Please check the app.");
      return;
    }
    await sendWhatsAppReply(from, briefingToText(briefing));
  } catch (err) {
    console.error('[WhatsApp] briefing send error:', err);
    await sendWhatsAppReply(from, '⚠️ Could not generate your briefing right now. Please try again shortly.');
  }
}

async function handleWebhook(payload: WaPayload) {
  try {
    console.log('[WhatsApp] Raw payload:', JSON.stringify(payload, null, 2));

    const change  = payload.entry?.[0]?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message) {
      console.log('[WhatsApp] No message in payload (status update or other event)');
      return;
    }

    console.log(`[WhatsApp] Message received — type: ${message.type}, from: ${message.from}`);

    const from            = message.from;
    const normalisedPhone = normalisePhone(from);
    const adminClient     = createAdminClient();

    // Stamp the 24h WhatsApp window: this user has just messaged us, so
    // business-initiated sends (e.g. the dashboard "Send to WhatsApp" button)
    // are allowed for the next 24h. Best-effort — ignore errors.
    await adminClient.from('user_profiles').update({ last_wa_inbound_at: new Date().toISOString() }).eq('phone', normalisedPhone);

    if (message.type === 'image') {
      await handleIncomingPhoto(from, normalisedPhone, message, adminClient);
      return;
    }

    if (message.type === 'interactive') {
      const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
      const id = reply?.id ?? '';

      if (id === 'menu_log_ticket') { await sendWhatsAppReply(from, '📝 Send a voice note or describe the maintenance issue, and I’ll log it for you.'); return; }
      if (id === 'menu_briefing')   { await sendBriefingViaWhatsApp(from, normalisedPhone, adminClient); return; }
      if (id === 'submit_ticket') { await handleSubmitButton(from, normalisedPhone, adminClient); return; }
      if (id === 'confirm_ticket') {
        const session = await fetchConfirmSession(normalisedPhone, adminClient);
        if (!session) { await sendWhatsAppReply(from, '⚠️ Nothing to confirm. Send a voice note or message to start a ticket.'); return; }
        await confirmDraft(from, session.id, adminClient);
        return;
      }
      if (id === 'edit_ticket') {
        const session = await fetchConfirmSession(normalisedPhone, adminClient);
        if (!session) { await sendWhatsAppReply(from, '⚠️ Nothing to edit. Send a voice note or message to start a ticket.'); return; }
        await sendFieldPicker(from);
        return;
      }
      if (id.startsWith('edit_field:')) { await handleEditFieldChoice(from, normalisedPhone, id.slice('edit_field:'.length), adminClient); return; }
      if (id.startsWith('set:'))        { await handleSetField(from, normalisedPhone, id, adminClient); return; }
      return;
    }

    if (message.type === 'audio' || message.type === 'text') {
      // Latest in-flight session (drafting or collecting photos) for this phone.
      const { data: active } = await adminClient
        .from('whatsapp_sessions')
        .select('id, title, description, priority, category, operational_impact, confidence, pending_field, photo_urls, status')
        .eq('phone', normalisedPhone)
        .in('status', ['awaiting_confirm', 'awaiting_photos'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle() as { data: (WaSession & { status: string }) | null };

      if (message.type === 'text') {
        const body  = (message.text?.body ?? '').trim();
        const lower = body.toLowerCase();

        if (active?.status === 'awaiting_photos') {
          if (lower === 'done') { await handleSubmitButton(from, normalisedPhone, adminClient); return; }
          await sendWhatsAppReply(from, `📸 Please send your photos (${active.photo_urls.length}/${MAX_PHOTOS} received), or reply *done* to submit.`);
          return;
        }
        if (active?.status === 'awaiting_confirm') {
          await handleConfirmText(from, active, body, adminClient);
          return;
        }
        // Keyword shortcuts (also power the text fallback when buttons fail).
        if (lower === 'ticket' || lower === 'log ticket' || lower === 'log a ticket') {
          await sendWhatsAppReply(from, '📝 Send a voice note or describe the maintenance issue, and I’ll log it for you.');
          return;
        }
        if (lower === 'briefing' || lower === 'daily briefing' || lower === 'debrief') {
          await sendBriefingViaWhatsApp(from, normalisedPhone, adminClient);
          return;
        }
        // Greeting / "menu" / "help" → role-aware menu instead of a ticket draft.
        if (isGreeting(body)) { await sendMainMenu(from, normalisedPhone, adminClient); return; }
        await handleNewTicket(from, normalisedPhone, message, adminClient);
        return;
      }

      // Audio: a new VN while a draft/photo session is open = redo the draft.
      if (active?.status === 'awaiting_confirm' || active?.status === 'awaiting_photos') {
        const extracted = await extractFromMessage(from, message);
        if (!extracted) return;
        await applyDraftUpdate(from, active.id, extracted, adminClient);
        return;
      }
      await handleNewTicket(from, normalisedPhone, message, adminClient);
      return;
    }

    console.log(`[WhatsApp] Ignored message type: ${message.type}`);
  } catch (err) {
    console.error('[WhatsApp] handleWebhook error:', err);
  }
}

// ─── Handler: new ticket from VN or text ─────────────────────────────────────
async function handleNewTicket(
  from: string,
  normalisedPhone: string,
  message: WaMessage,
  adminClient: ReturnType<typeof createAdminClient>
) {
  const extracted = await extractFromMessage(from, message);
  if (!extracted) return;
  console.log(`[WhatsApp] Extracted:`, extracted);

  // Not a maintenance issue (greeting, small talk, question, etc.) → show the
  // menu instead of drafting a ticket from it.
  if (!extracted.is_issue) {
    await sendMainMenu(from, normalisedPhone, adminClient, "That doesn't look like a maintenance issue 🙂 What would you like to do?");
    return;
  }

  const { title, description, priority, category, operational_impact } = extracted;

  // Look up sender (v3): user_profiles by phone → must be a store manager linked to a store.
  const { data: senderProfile } = await adminClient
    .from('user_profiles')
    .select('id, role, company_id')
    .eq('phone', normalisedPhone)
    .maybeSingle();

  console.log(`[WhatsApp] Profile lookup — phone: "${normalisedPhone}", role: ${senderProfile?.role ?? 'none'}`);

  if (!senderProfile) {
    await sendWhatsAppReply(from, '⚠️ Your number is not registered in Motiv. Please contact your administrator.');
    return;
  }
  if (senderProfile.role !== 'store_manager' && senderProfile.role !== 'client') {
    await sendWhatsAppReply(from, '⚠️ Only store managers can submit tickets via WhatsApp.');
    return;
  }
  const { data: storeLink } = await adminClient.from('store_users').select('store_id').eq('user_id', senderProfile.id).limit(1).maybeSingle();
  if (!storeLink?.store_id) {
    await sendWhatsAppReply(from, '⚠️ Your account is not linked to a store yet. Please contact your regional manager.');
    return;
  }

  // Store ticket fields in session — ticket created AFTER photos collected
  const source = message.type === 'audio' ? 'WhatsApp voice note' : 'WhatsApp message';
  const { data: session, error: sessionError } = await adminClient
    .from('whatsapp_sessions')
    .insert({
      phone:       normalisedPhone,
      title,
      description: `${description}\n\n_Submitted via ${source}_`,
      priority,
      category,
      operational_impact,
      confidence:  extracted.confidence,
      photo_urls:  [],
      status:      'awaiting_confirm',
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    console.error('[WhatsApp] Session insert failed:', sessionError?.message);
    await sendWhatsAppReply(from, '❌ Sorry, there was an error. Please try again.');
    return;
  }

  await sendDraft(from, extracted);
}

// ─── Confirm / edit the AI draft before photos ───────────────────────────────

/** Confirm tapped → move to photo collection. */
async function confirmDraft(from: string, sessionId: string, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  await adminClient.from('whatsapp_sessions').update({ status: 'awaiting_photos' }).eq('id', sessionId);
  await sendWhatsAppReply(from, `📸 Great — now send at least *${MIN_PHOTOS} photos* of the issue (max ${MAX_PHOTOS}).`);
}

/** Replace the session draft from a fresh extraction and re-show it for confirmation. */
async function applyDraftUpdate(from: string, sessionId: string, extracted: ExtractedTicket, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  await adminClient.from('whatsapp_sessions').update({
    title:              extracted.title,
    description:        `${extracted.description}\n\n_Submitted via WhatsApp_`,
    priority:           extracted.priority,
    category:           extracted.category,
    operational_impact: extracted.operational_impact,
    confidence:         extracted.confidence,
    status:             'awaiting_confirm',
  }).eq('id', sessionId);
  await sendDraft(from, extracted);
}

const CONFIRM_WORDS = new Set(['yes', 'y', 'ok', 'okay', 'looks good', 'correct', 'confirm', 'done', 'good', '👍']);
const CANCEL_WORDS  = new Set(['cancel', 'stop', 'no']);
const FIELD_RE = /^(title|description|category|impact|operational impact|priority)\s*[:=]\s*([\s\S]+)$/i;

/** Handle a text reply while a draft awaits confirmation: confirm, cancel, edit one field, or redo. */
async function handleConfirmText(from: string, session: WaSession, body: string, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  const lower = body.trim().toLowerCase();

  if (CONFIRM_WORDS.has(lower)) { await confirmDraft(from, session.id, adminClient); return; }
  if (CANCEL_WORDS.has(lower)) {
    await adminClient.from('whatsapp_sessions').update({ status: 'cancelled' }).eq('id', session.id);
    await sendWhatsAppReply(from, '❌ Cancelled. Send a new voice note or message to start again.');
    return;
  }

  // Tap-to-edit Title/Description: capture this whole message as that field.
  if (session.pending_field === 'title' || session.pending_field === 'description') {
    await applyFieldAndRedraw(from, session, session.pending_field, body, adminClient);
    return;
  }

  const m = body.match(FIELD_RE);
  if (m) {
    const field = m[1].toLowerCase();
    const value = m[2].trim();
    const update: Record<string, string> = {};
    const view: DraftView = { title: session.title, description: cleanDescription(session.description), category: session.category, operational_impact: session.operational_impact, priority: session.priority, confidence: session.confidence };

    if (field === 'title') { update.title = value.slice(0, 80); view.title = update.title; }
    else if (field === 'description') { update.description = `${value}\n\n_Submitted via WhatsApp_`; view.description = value; }
    else if (field === 'category') {
      const v = value.toLowerCase();
      const match = CATEGORIES.find(c => c.toLowerCase() === v) ?? CATEGORIES.find(c => c.toLowerCase().startsWith(v));
      if (!match) { await sendWhatsAppReply(from, `⚠️ Unknown category. Options: ${CATEGORIES.join(', ')}`); return; }
      update.category = match; view.category = match;
    }
    else if (field === 'impact' || field === 'operational impact') {
      const norm = value.toLowerCase().replace(/\s+/g, '_');
      const match = (IMPACTS as readonly string[]).includes(norm)
        ? (norm as OpImpact)
        : (IMPACTS.find(i => OPERATIONAL_IMPACT_LABELS[i].toLowerCase() === value.toLowerCase())
          ?? IMPACTS.find(i => OPERATIONAL_IMPACT_LABELS[i].toLowerCase().includes(value.toLowerCase())));
      if (!match) { await sendWhatsAppReply(from, `⚠️ Unknown impact. Options: ${IMPACTS.map(i => OPERATIONAL_IMPACT_LABELS[i]).join(', ')}`); return; }
      update.operational_impact = match; view.operational_impact = match;
    }
    else if (field === 'priority') {
      const v = value.toLowerCase();
      if (!['low', 'medium', 'high', 'urgent'].includes(v)) { await sendWhatsAppReply(from, '⚠️ Priority must be low, medium, high or urgent.'); return; }
      update.priority = v; view.priority = v;
    }
    await adminClient.from('whatsapp_sessions').update(update).eq('id', session.id);
    await sendDraft(from, view);
    return;
  }

  // Free text → redo the whole draft from it.
  await sendWhatsAppReply(from, '💬 Updating your ticket…');
  const extracted = await extractTicketFields(body);
  await applyDraftUpdate(from, session.id, extracted, adminClient);
}

/** Latest draft (awaiting_confirm) for this phone. */
async function fetchConfirmSession(phone: string, adminClient: ReturnType<typeof createAdminClient>): Promise<WaSession | null> {
  const { data } = await adminClient
    .from('whatsapp_sessions')
    .select('id, title, description, priority, category, operational_impact, confidence, pending_field, photo_urls')
    .eq('phone', phone).eq('status', 'awaiting_confirm')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data as WaSession | null) ?? null;
}

/** User picked which field to edit from the list. */
async function handleEditFieldChoice(from: string, phone: string, field: string, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  if (field === 'category') {
    await sendWhatsAppList(from, 'Pick the correct category:', 'Categories', CATEGORIES.map(c => ({ id: `set:category:${c}`, title: c })));
    return;
  }
  if (field === 'impact') {
    await sendWhatsAppList(from, 'Pick the operational impact:', 'Impact options', IMPACTS.map(i => ({ id: `set:impact:${i}`, title: OPERATIONAL_IMPACT_LABELS[i] })));
    return;
  }
  if (field === 'priority') {
    await sendWhatsAppList(from, 'Pick the priority:', 'Priorities', (['low', 'medium', 'high', 'urgent'] as Priority[]).map(p => ({ id: `set:priority:${p}`, title: `${PRIORITY_EMOJI[p]} ${cap(p)}` })));
    return;
  }
  // title / description → capture the next text message
  const session = await fetchConfirmSession(phone, adminClient);
  if (!session) { await sendWhatsAppReply(from, '⚠️ Nothing to edit. Send a voice note or message to start a ticket.'); return; }
  await adminClient.from('whatsapp_sessions').update({ pending_field: field }).eq('id', session.id);
  await sendWhatsAppReply(from, `✏️ Send the new *${field}* as a message.`);
}

/** User tapped a value row: set:<field>:<value>. */
async function handleSetField(from: string, phone: string, id: string, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  const [, field, ...rest] = id.split(':');
  const value = rest.join(':');
  const session = await fetchConfirmSession(phone, adminClient);
  if (!session) { await sendWhatsAppReply(from, '⚠️ Nothing to edit. Send a voice note or message to start a ticket.'); return; }
  await applyFieldAndRedraw(from, session, field, value, adminClient);
}

/** Apply one field edit, clear any pending state, and re-show the draft. */
async function applyFieldAndRedraw(from: string, session: WaSession, field: string, value: string, adminClient: ReturnType<typeof createAdminClient>): Promise<void> {
  const update: Record<string, string | null> = { pending_field: null };
  const view: DraftView = { title: session.title, description: cleanDescription(session.description), category: session.category, operational_impact: session.operational_impact, priority: session.priority, confidence: session.confidence };
  switch (field) {
    case 'title':       update.title = value.slice(0, 80); view.title = update.title; break;
    case 'description': update.description = `${value}\n\n_Submitted via WhatsApp_`; view.description = value; break;
    case 'category':    update.category = value; view.category = value; break;
    case 'impact':      update.operational_impact = value; view.operational_impact = value; break;
    case 'priority':    update.priority = value; view.priority = value; break;
  }
  await adminClient.from('whatsapp_sessions').update(update).eq('id', session.id);
  await sendDraft(from, view);
}

// ─── Handler: incoming photo(s) ──────────────────────────────────────────────
async function handleIncomingPhoto(
  from: string,
  normalisedPhone: string,
  message: WaMessage,
  adminClient: ReturnType<typeof createAdminClient>
) {
  const { data: session } = await adminClient
    .from('whatsapp_sessions')
    .select('id, title, description, priority, category, operational_impact, confidence, photo_urls')
    .eq('phone', normalisedPhone)
    .eq('status', 'awaiting_photos')
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: WaSession | null };

  if (!session) {
    const { data: draft } = await adminClient
      .from('whatsapp_sessions').select('id')
      .eq('phone', normalisedPhone).eq('status', 'awaiting_confirm')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    await sendWhatsAppReply(from, draft
      ? '⚠️ Please confirm the ticket details first (tap *✅ Looks good*) before sending photos.'
      : '⚠️ No active ticket found. Please send a voice note or text to create a ticket first.');
    return;
  }

  const currentCount = session.photo_urls.length;

  if (currentCount >= MAX_PHOTOS) {
    await sendWhatsAppReply(from, `⚠️ Maximum ${MAX_PHOTOS} photos already received. Tap *Submit Ticket* to finalise.`);
    return;
  }

  const mediaId  = message.image?.id;
  const mimeType = message.image?.mime_type ?? 'image/jpeg';
  if (!mediaId) return;

  // Download + upload to storage
  const { arrayBuffer } = await downloadMedia(mediaId);
  const photoUrl = await uploadPhotoToStorage(session.id, arrayBuffer, mimeType);

  // Atomically append to session (handles simultaneous uploads)
  const updatedUrls = await appendSessionPhoto(session.id, photoUrl, adminClient);
  const newCount    = updatedUrls.length;

  console.log(`[WhatsApp] Photo ${newCount}/${MAX_PHOTOS} uploaded for session ${session.id}`);

  if (newCount >= MAX_PHOTOS) {
    // Auto-submit at max
    await finaliseSession(from, normalisedPhone, session, updatedUrls, adminClient);
  } else if (newCount >= MIN_PHOTOS) {
    await sendWhatsAppButton(
      from,
      `📸 *${newCount}/${MAX_PHOTOS} photos received.*\n\nYou can submit now or send more photos (up to ${MAX_PHOTOS}).`,
      '✅ Submit Ticket',
      'submit_ticket'
    );
  } else {
    const remaining = MIN_PHOTOS - newCount;
    await sendWhatsAppReply(
      from,
      `📸 Photo ${newCount} received. Please send ${remaining} more photo${remaining > 1 ? 's' : ''}.`
    );
  }
}

// ─── Handler: submit button tapped ───────────────────────────────────────────
async function handleSubmitButton(
  from: string,
  normalisedPhone: string,
  adminClient: ReturnType<typeof createAdminClient>
) {
  const { data: session } = await adminClient
    .from('whatsapp_sessions')
    .select('id, title, description, priority, category, operational_impact, confidence, photo_urls')
    .eq('phone', normalisedPhone)
    .eq('status', 'awaiting_photos')
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: WaSession | null };

  if (!session) {
    await sendWhatsAppReply(from, '⚠️ No active ticket found.');
    return;
  }

  const photoCount = session.photo_urls.length;

  if (photoCount < MIN_PHOTOS) {
    await sendWhatsAppReply(
      from,
      `⚠️ Please send at least *${MIN_PHOTOS} photos* before submitting. You've sent ${photoCount} so far.`
    );
    return;
  }

  await finaliseSession(from, normalisedPhone, session, session.photo_urls, adminClient);
}

// ─── Shared: create ticket + notify + mark session complete ───────────────────
async function finaliseSession(
  from: string,
  normalisedPhone: string,
  session: WaSession,
  photoUrls: string[],
  adminClient: ReturnType<typeof createAdminClient>
) {
  // Mark session complete first to prevent double-submit
  await adminClient.from('whatsapp_sessions').update({ status: 'complete' }).eq('id', session.id);

  // Resolve sender → store (v3)
  const { data: senderProfile } = await adminClient
    .from('user_profiles').select('id, company_id').eq('phone', normalisedPhone).maybeSingle();
  const { data: storeLink } = senderProfile
    ? await adminClient.from('store_users').select('store_id').eq('user_id', senderProfile.id).limit(1).maybeSingle()
    : { data: null };
  if (!senderProfile?.company_id || !storeLink?.store_id) {
    await sendWhatsAppReply(from, '❌ Error finalising ticket — your account is not linked to a store. Please contact your administrator.');
    return;
  }
  const { data: store } = await adminClient
    .from('stores').select('id, region_id, region_code, branch_code, name').eq('id', storeLink.store_id).single();
  if (!store) {
    await sendWhatsAppReply(from, '❌ Error finalising ticket. Please contact your administrator.');
    return;
  }

  const { priority, severity } = impactToPriority(session.operational_impact as OpImpact);
  const needsReview = (session.confidence ?? 1) < CONFIDENCE_THRESHOLD;

  // Create the v3 ticket with all photos
  const { data: ticket, error: ticketError } = await adminClient
    .from('tickets')
    .insert({
      company_id:  senderProfile.company_id,
      store_id:    store.id,
      region_id:   store.region_id,
      region_code: store.region_code,
      branch_code: store.branch_code,
      created_by:  senderProfile.id,
      title:       session.title,
      description: session.description,
      category:    session.category,
      priority,
      severity,
      operational_impact: session.operational_impact,
      needs_review: needsReview,
      status:      'open',
      photo_urls:  photoUrls,
      last_store_update_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (ticketError || !ticket) {
    console.error('[WhatsApp] Ticket creation failed:', ticketError);
    await sendWhatsAppReply(from, '❌ Error creating ticket. Please contact your administrator.');
    return;
  }

  console.log(`[WhatsApp] Ticket created: ${ticket.id} with ${photoUrls.length} photos`);

  await notifyRegion(adminClient, {
    ticketId: ticket.id, title: session.title, priority, companyId: senderProfile.company_id,
    regionId: store.region_id, storeName: store.name, needsReview,
  });

  await sendWhatsAppReply(
    from,
    `✅ *Ticket submitted successfully!*\n\n` +
    `*Title:* ${session.title}\n` +
    `*Priority:* ${P_EMOJI[priority]} ${priority}\n` +
    `*Photos:* ${photoUrls.length}\n\n` +
    `Your ticket has been logged and the team has been notified. 🔧`
  );
}
