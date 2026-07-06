import 'server-only'
import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

export interface AuditEntry {
  /** The user who performed the action (auth.uid). FK → user_profiles.id. */
  actorId: string | null
  /** Company scope, if the action is scoped to one. FK → companies.id. Nullable. */
  companyId?: string | null
  /** Namespaced verb, e.g. 'provision.add_store', 'admin.create_executive'. */
  action: string
  /** What kind of thing was affected: 'user' | 'store' | 'region' | 'supplier' … */
  entityType?: string | null
  /** The affected row id. MUST be a uuid (column is uuid, no FK) or omitted. */
  entityId?: string | null
  /** Small, non-secret context (emails/names/ids/flags). NEVER passwords/tokens. */
  metadata?: Record<string, unknown> | null
}

/**
 * Append one row to public.audit_logs for a privileged action (B10).
 *
 * Best-effort by design: it must NEVER throw or reject — a logging failure can't
 * be allowed to break the mutation it records. Errors are swallowed to the server
 * console. Always called with the service-role (admin) client because RLS makes
 * audit_logs read-only to end users (there is no insert policy).
 */
export async function logAudit(admin: AdminClient, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await admin.from('audit_logs').insert({
      actor_id: entry.actorId,
      company_id: entry.companyId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
    })
    if (error) console.error('[audit] insert failed:', entry.action, error.message)
  } catch (e) {
    console.error('[audit] insert threw:', entry.action, e)
  }
}
