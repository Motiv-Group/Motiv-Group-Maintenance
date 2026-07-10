import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsChrome } from '@/components/settings/SettingsChrome'

const ROLE_HOME: Record<string, string> = {
  supplier: '/supplier',
  regional_manager: '/regional',
  executive: '/executive',
  system_admin: '/admin',
  individual: '/individual',
  store_manager: '/client',
  client: '/client',
}
const ROLE_LABEL: Record<string, string> = {
  supplier: 'Supplier',
  regional_manager: 'Regional Manager',
  executive: 'Executive',
  system_admin: 'System Admin',
  individual: 'Individual',
  store_manager: 'Store Manager',
  client: 'Store Manager',
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'client'
  const isStore = role === 'store_manager' || role === 'client'

  return (
    <SettingsChrome
      userName={profile?.full_name ?? null}
      roleLabel={ROLE_LABEL[role] ?? 'Account'}
      roleHome={ROLE_HOME[role] ?? '/client'}
      profileLabel={isStore ? 'Store Info' : 'Profile'}
    >
      {children}
    </SettingsChrome>
  )
}
