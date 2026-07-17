import { createAdminClient } from '@/lib/supabase/server';
import https from 'https';
import { fetchWithRetry } from '@/lib/fetch-retry';
import { sanitiseExtracted, type ExtractedTicket } from '@/lib/whatsapp/extract';

// ─── ENV ────────────────────────────────────────────────────────────────────
const WA_TOKEN      = process.env.WHATSAPP_ACCESS_TOKEN!;
const GROQ_API_KEY  = process.env.GROQ_API_KEY!;
const GROQ_BASE     = 'https://api.groq.com/openai/v1';
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/** Download a Meta media file as an ArrayBuffer */
export async function downloadMedia(mediaId: string): Promise<{ arrayBuffer: ArrayBuffer; mimeType: string }> {
  const metaRes = await fetchWithRetry(
    `https://graph.facebook.com/v21.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${WA_TOKEN}` } },
    { timeoutMs: 15_000, retries: 1, label: 'wa-media-lookup' }
  );
  if (!metaRes.ok) throw new Error(`Meta media lookup failed: ${metaRes.status}`);
  const { url, mime_type } = await metaRes.json() as { url: string; mime_type: string };

  // Use Node https — undici has a known TLS socket issue with Meta's CDN
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const req = https.get(url, { headers: { Authorization: `Bearer ${WA_TOKEN}` }, timeout: 30_000 }, (res) => {
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
    });
    req.on('timeout', () => req.destroy(new Error('Media download timed out (30s)')));
    req.on('error', reject);
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
export async function transcribeAndExtract(arrayBuffer: ArrayBuffer, mimeType: string): Promise<ExtractedTicket> {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'ogg';
  const form = new FormData();
  form.append('file', new Blob([arrayBuffer], { type: mimeType }), `audio.${ext}`);
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'text');
  form.append('temperature', '0');
  // Vocabulary/accent bias for SA English + Afrikaans code-switching. Language
  // stays auto-detected so the Afrikaans mix is captured, then the LLM translates.
  form.append('prompt', WHISPER_PROMPT);

  const res = await fetchWithRetry(`${GROQ_BASE}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  }, { timeoutMs: 45_000, retries: 1, label: 'groq-transcribe' });
  if (!res.ok) throw new Error(`Groq transcription failed: ${await res.text()}`);

  const transcript = (await res.text()).trim();
  if (!transcript) throw new Error('Empty transcript');

  return extractTicketFields(transcript);
}

/** Extract ticket fields from plain text using Groq LLaMA */
export async function extractTicketFields(text: string): Promise<ExtractedTicket> {
  const res = await fetchWithRetry(`${GROQ_BASE}/chat/completions`, {
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
  }, { timeoutMs: 30_000, retries: 1, label: 'groq-extract' });

  if (!res.ok) throw new Error(`Groq extraction failed: ${await res.text()}`);

  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  const raw  = JSON.parse(json.choices[0].message.content) as Partial<ExtractedTicket>;

  return sanitiseExtracted(raw, text);
}

/** Upload image buffer to Supabase Storage, return public URL */
export async function uploadPhotoToStorage(
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
