import { createClient, createAdminClient } from '@/lib/supabase/server'

/** Count of unread notifications for the current user (0 if signed out). */
export async function getUnreadCount(): Promise<number> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const admin = createAdminClient()
  const { count } = await admin
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false)
  return count ?? 0
}
