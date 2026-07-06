import { NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Validate a JSON request body against a zod schema.
 *
 * Non-breaking by design: a missing/empty/unparseable body is treated as `{}`
 * (mirrors the old `await request.json().catch(() => ({}))` pattern), so a schema
 * whose fields are all optional still passes an empty body. Unknown keys are
 * stripped (zod's default) — same as the old "pick the fields we need" behaviour.
 * The win: wrong-typed or missing-required fields now become an explicit 400
 * instead of silently becoming `undefined` / `NaN` deeper in the handler.
 *
 * Usage:
 *   const parsed = await parseJsonBody(request, BodySchema)
 *   if (!parsed.ok) return parsed.error
 *   const { field } = parsed.data   // fully typed
 */
export async function parseJsonBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; error: NextResponse }> {
  let raw: unknown
  try { raw = await request.json() } catch { raw = {} }
  if (raw == null || typeof raw !== 'object') raw = {}
  const result = schema.safeParse(raw)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path.length ? issue.path.join('.') : 'body'
    const message = issue ? `${where}: ${issue.message}` : 'Invalid request body'
    return { ok: false, error: NextResponse.json({ error: message }, { status: 400 }) }
  }
  return { ok: true, data: result.data }
}

// Small shared field helpers for common contracts.
export const zUuid = z.string().uuid()
export const zNonEmpty = z.string().trim().min(1)
