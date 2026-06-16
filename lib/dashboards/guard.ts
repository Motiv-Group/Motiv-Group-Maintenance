import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/** Gate a Server Component to executives. Redirects otherwise. */
export async function requireExecutive() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'executive') redirect('/auth/login')
  return { user, profile }
}

/** Gate a Server Component to regional managers. */
export async function requireRegionalManager() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')
  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (profile?.role !== 'regional_manager') redirect('/auth/login')
  return { user, profile }
}
