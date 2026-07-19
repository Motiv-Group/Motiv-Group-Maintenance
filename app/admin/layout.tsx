import type { ReactNode } from 'react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { ExecChrome } from '@/components/exec/ExecChrome'
import { RealtimeRefresh } from '@/components/ui/RealtimeRefresh'
import { getUnreadCount } from '@/lib/notifications/unread'

export const dynamic = 'force-dynamic'

// Platform-admin area (gated to system_admin by middleware + requireMasterAdmin).
// Mounts the shared ExecChrome shell (variant='admin') so it matches every other
// role: desktop sidebar + mobile bottom tabs + shared header icon row.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { userId } = await requireMasterAdmin()
  const admin = createAdminClient()
  const { data: prof } = await admin.from('user_profiles').select('full_name, avatar_url').eq('id', userId).single()
  const unreadCount = await getUnreadCount()
  return (
    <ExecChrome userName={prof?.full_name ?? 'Admin'} variant="admin" unreadCount={unreadCount} avatarUrl={prof?.avatar_url ?? null}>
      <RealtimeRefresh tables={['notifications', 'suppliers', 'projects', 'project_stores', 'project_files']} />
      {children}
    </ExecChrome>
  )
}
