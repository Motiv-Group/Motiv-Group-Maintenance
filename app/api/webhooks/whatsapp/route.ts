import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendPushToMany } from '@/lib/push';
import type { Priority } from '@/lib/types';
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
  interactive?: { button_reply: { id: string; title: string } };
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

interface ExtractedTicket {
  title: string;
  description: string;
  priority: Priority;
}

interface WaSession {
  id: string;
  title: string;
  description: string;
  priority: string;
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

const TICKET_EXTRACTION_PROMPT = `You are a maintenance ticket assistant for a South African retail maintenance platform.
Extract structured fields and return ONLY a valid JSON object with these exact keys:
- "title": short one-line summary of the issue (max 80 chars)
- "description": detailed description of the issue
- "priority": one of "low", "medium", "high", "urgent"

Priority guide: urgent = safety hazard or no service, high = major disruption, medium = moderate issue, low = minor/cosmetic.
Input may be South African English or Afrikaans — handle both.`;

/** Transcribe audio using Groq Whisper, then extract ticket fields */
async function transcribeAndExtract(arrayBuffer: ArrayBuffer, mimeType: string): Promise<ExtractedTicket> {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'ogg';
  const form = new FormData();
  form.append('file', new Blob([arrayBuffer], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');
  // No language hint — Whisper auto-detects SA English/Afrikaans mix

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
  return {
    title:       raw.title ?? 'Maintenance request',
    description: raw.description ?? fallbackDescription ?? 'No description provided',
    priority:    validPriorities.includes(raw.priority as Priority) ? (raw.priority as Priority) : 'medium',
  };
}

// AI urgency word → v3 ticket priority (P1–P4) + severity.
type V3Priority = 'P1' | 'P2' | 'P3' | 'P4';
function mapPriority(word: Priority): { priority: V3Priority; severity: 'low' | 'medium' | 'high' | 'critical' } {
  switch (word) {
    case 'urgent': return { priority: 'P1', severity: 'critical' };
    case 'high':   return { priority: 'P2', severity: 'high' };
    case 'low':    return { priority: 'P4', severity: 'low' };
    default:       return { priority: 'P3', severity: 'medium' };
  }
}
const P_EMOJI: Record<V3Priority, string> = { P1: '🔴', P2: '🟠', P3: '🟡', P4: '🟢' };

/** Send a WhatsApp text reply */
async function sendWhatsAppReply(to: string, text: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
}

/** Send a WhatsApp interactive button message */
async function sendWhatsAppButton(to: string, bodyText: string, buttonLabel: string, buttonId: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: bodyText },
        action: {
          buttons: [{ type: 'reply', reply: { id: buttonId, title: buttonLabel } }],
        },
      },
    }),
  });
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
  o: { ticketId: string; title: string; priority: string; companyId: string; regionId: string | null; storeName: string }
): Promise<void> {
  if (o.regionId) {
    const { data: rms } = await adminClient.from('regional_users').select('user_id').eq('region_id', o.regionId);
    const ids = (rms ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length) {
      await adminClient.from('notifications').insert(ids.map(id => ({
        company_id: o.companyId, user_id: id, type: 'new_ticket', title: 'New Ticket in Your Region',
        message: `${o.storeName} logged a ${o.priority} ticket via WhatsApp: "${o.title}"`, link: '/regional/tickets',
      })));
      void sendPushToMany(ids, { title: 'New Ticket', body: `${o.storeName}: ${o.title}`, url: '/regional/tickets' });
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

    if (message.type === 'image') {
      await handleIncomingPhoto(from, normalisedPhone, message, adminClient);
      return;
    }

    if (message.type === 'interactive') {
      if (message.interactive?.button_reply?.id === 'submit_ticket') {
        await handleSubmitButton(from, normalisedPhone, adminClient);
      }
      return;
    }

    if (message.type === 'audio' || message.type === 'text') {
      // Text "done" while session active = submit
      if (message.type === 'text') {
        const body = (message.text?.body ?? '').trim().toLowerCase();
        if (body === 'done') {
          await handleSubmitButton(from, normalisedPhone, adminClient);
          return;
        }

        // Active session = remind to send photos
        const { data: activeSession } = await adminClient
          .from('whatsapp_sessions')
          .select('id, photo_urls')
          .eq('phone', normalisedPhone)
          .eq('status', 'awaiting_photos')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (activeSession) {
          const count = (activeSession.photo_urls as string[]).length;
          await sendWhatsAppReply(
            from,
            `📸 Please send your photos (${count}/${MAX_PHOTOS} received).`
          );
          return;
        }
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
  let extracted: ExtractedTicket;

  if (message.type === 'audio') {
    const mediaId = message.audio?.id;
    if (!mediaId) return;

    console.log(`[WhatsApp] Voice note received from ${from}, media: ${mediaId}`);
    await sendWhatsAppReply(from, '🎙️ Voice note received! Processing your request, please hold on...');

    const { arrayBuffer, mimeType } = await downloadMedia(mediaId);
    extracted = await transcribeAndExtract(arrayBuffer, mimeType);
    console.log(`[WhatsApp] Extracted:`, extracted);
  } else {
    const transcript = (message.text?.body ?? '').trim();
    if (!transcript) return;
    await sendWhatsAppReply(from, '💬 Message received! Processing your request, please hold on...');
    extracted = await extractTicketFields(transcript);
  }

  const { title, description, priority } = extracted;

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
      photo_urls:  [],
      status:      'awaiting_photos',
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    console.error('[WhatsApp] Session insert failed:', sessionError?.message);
    await sendWhatsAppReply(from, '❌ Sorry, there was an error. Please try again.');
    return;
  }

  const priorityEmoji: Record<Priority, string> = { low: '🟢', medium: '🟡', high: '🟠', urgent: '🔴' };

  await sendWhatsAppReply(
    from,
    `✅ *Got it!*\n\n` +
    `*Title:* ${title}\n` +
    `*Priority:* ${priorityEmoji[priority]} ${priority.charAt(0).toUpperCase() + priority.slice(1)}\n\n` +
    `📸 Please send at least *${MIN_PHOTOS} photos* of the issue (max ${MAX_PHOTOS}).`
  );
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
    .select('id, title, description, priority, photo_urls')
    .eq('phone', normalisedPhone)
    .eq('status', 'awaiting_photos')
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: WaSession | null };

  if (!session) {
    await sendWhatsAppReply(from, '⚠️ No active ticket found. Please send a voice note or text to create a ticket first.');
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
    .select('id, title, description, priority, photo_urls')
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

  const { priority, severity } = mapPriority(session.priority as Priority);

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
      priority,
      severity,
      operational_impact: 'none',
      status:      'open',
      photo_urls:  photoUrls,
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
    regionId: store.region_id, storeName: store.name,
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
