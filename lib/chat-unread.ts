// Whether the ticket's chat has messages the given user hasn't read yet — i.e. any
// message authored by the OTHER party after the user's read cursor. Server-only
// (uses the service-role admin client); drives the unread dot on the ticket-detail
// header chat icon. Cheap: one read-cursor lookup + one head count.
export async function ticketChatUnread(admin: any, ticketId: string, userId: string): Promise<boolean> {
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
