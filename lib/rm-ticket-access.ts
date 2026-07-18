// Whether a regional_manager may act on a ticket.
//
// The denormalised `tickets.region_id` is trigger-filled but can be NULL/stale when
// the ticket was logged before its store was linked to a region. The RM dashboard
// already keys off STORE membership (so those tickets still surface for the RM), so
// the write APIs must use the same rule — otherwise the RM sees a ticket it can't
// act on and hits "Not your ticket". Prefer the ticket's region_id, else fall back
// to the ticket's store region.
import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

export async function rmOwnsTicket(
  admin: AdminClient,
  userId: string,
  ticket: { region_id?: string | null; store_id?: string | null },
): Promise<boolean> {
  const { data: links } = await admin.from('regional_users').select('region_id').eq('user_id', userId)
  const regionIds = new Set((links ?? []).map((l) => l.region_id).filter(Boolean))
  if (!regionIds.size) return false
  if (ticket.region_id && regionIds.has(ticket.region_id)) return true
  if (ticket.store_id) {
    const { data: store } = await admin.from('stores').select('region_id').eq('id', ticket.store_id).maybeSingle()
    if (store?.region_id && regionIds.has(store.region_id)) return true
  }
  return false
}
