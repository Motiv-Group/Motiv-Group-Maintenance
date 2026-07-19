// Whether the ticket's chat has messages the given user hasn't read yet — i.e. any
// message authored by the OTHER party after the user's read cursor. Server-only
// (uses the service-role admin client); drives the unread dot on the ticket-detail
// header chat icon. Cheap: one read-cursor lookup + one head count.
import type { createAdminClient } from '@/lib/supabase/server'

type AdminClient = ReturnType<typeof createAdminClient>

export async function ticketChatUnread(admin: AdminClient, ticketId: string, userId: string): Promise<boolean> {
  const { data: read } = await admin
    .from('ticket_chat_reads').select('last_read_at')
    .eq('ticket_id', ticketId).eq('user_id', userId).maybeSingle()
  const lastRead: string | null = read?.last_read_at ?? null

  let q = admin
    .from('ticket_chat_messages').select('id', { count: 'exact', head: true })
    .eq('ticket_id', ticketId).neq('author_id', userId)
  if (lastRead) q = q.gt('created_at', lastRead)
  const { count } = await q
  return (count ?? 0) > 0
}

const MAX_TICKETS = 100

/**
 * Batch unread counts for the Today-queue row badges: ticketId → number of
 * messages authored by others after the viewer's read cursor (no cursor row =
 * never opened → everything counts). For Store-Manager viewers (smViewer) only
 * tickets the RM added them to count, respecting the sm_history_from cutoff
 * chosen at add-time.
 */
export async function chatUnreadCounts(
  admin: AdminClient,
  userId: string,
  ticketIds: string[],
  opts?: { smViewer?: boolean },
): Promise<Record<string, number>> {
  const ids = [...new Set(ticketIds)].slice(0, MAX_TICKETS)
  if (!ids.length) return {}

  let allowed = ids
  const cutoff = new Map<string, string>()
  if (opts?.smViewer) {
    const { data: settings } = await admin.from('ticket_chat_settings')
      .select('ticket_id, sm_added_at, sm_history_from').in('ticket_id', ids)
    allowed = (settings ?? []).filter(s => s.sm_added_at).map(s => s.ticket_id).filter((t): t is string => !!t)
    for (const s of settings ?? []) if (s.ticket_id && s.sm_added_at && s.sm_history_from) cutoff.set(s.ticket_id, s.sm_history_from)
    if (!allowed.length) return {}
  }

  const [{ data: reads }, { data: msgs }] = await Promise.all([
    admin.from('ticket_chat_reads').select('ticket_id, last_read_at').eq('user_id', userId).in('ticket_id', allowed),
    admin.from('ticket_chat_messages').select('ticket_id, author_id, created_at').in('ticket_id', allowed),
  ])
  const lastRead = new Map((reads ?? []).map(r => [r.ticket_id, r.last_read_at]))

  const counts: Record<string, number> = {}
  for (const m of msgs ?? []) {
    if (m.author_id === userId) continue
    const read = lastRead.get(m.ticket_id)
    if (read && m.created_at <= read) continue
    const cut = cutoff.get(m.ticket_id)
    if (cut && m.created_at < cut) continue
    counts[m.ticket_id] = (counts[m.ticket_id] ?? 0) + 1
  }
  return counts
}

/** Which of these tickets have the SM side added to the chat (for showing SM entry points). */
export async function smChatAdded(admin: AdminClient, ticketIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(ticketIds)].slice(0, MAX_TICKETS)
  if (!ids.length) return new Set()
  const { data } = await admin.from('ticket_chat_settings').select('ticket_id, sm_added_at').in('ticket_id', ids)
  return new Set((data ?? []).filter(s => s.sm_added_at).map(s => s.ticket_id).filter((t): t is string => !!t))
}
