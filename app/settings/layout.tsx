import { createClient } from '@/lib/supabase/server'
import { Navbar } from '@/components/ui/Navbar'
import { redirect } from 'next/navigation'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'client'
  const navRole = role === 'supplier' ? 'supplier'
    : role === 'regional_manager' ? 'regional'
    : 'client'

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar role={navRole as any} />
      {/* Same content width as the rest of the app (see ExecChrome). */}
      <main className="flex-1 max-w-[1700px] w-full mx-auto px-4 sm:px-5 py-6 pb-24">
        {children}
      </main>
    </div>
  )
}
