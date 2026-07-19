import { redirect } from 'next/navigation'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { ConfirmForm } from '@/components/auth/ConfirmForm'
import { verifyAccountToken } from '@/lib/auth-token'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Spent = the password was (re)set at/after THIS link was issued (so this token,
// or a newer one, already activated the account). Plain helper — keeps the
// impure Date.now() out of the component render body.
async function isLinkSpent(token: string): Promise<boolean> {
  if (!token) return false
  const verified = verifyAccountToken(token, Date.now())
  if (!verified) return false
  const admin = createAdminClient()
  const { data } = await admin.from('user_profiles').select('password_set_at').eq('id', verified.userId).single()
  const setAt = data?.password_set_at ? new Date(data.password_set_at).getTime() : 0
  return setAt >= verified.issuedAt
}

// Invite/recovery landing. The token is NOT verified for validity on GET (so a
// scanner can't probe it) — the form renders and the token is checked on submit.
// The ONE exception: a SPENT link is bounced to /auth/login instead of re-showing
// the set-password form.
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ t?: string; type?: string }> }) {
  const { t, type: rawType } = await searchParams
  const token = t ?? ''
  const type: 'invite' | 'recovery' = rawType === 'recovery' ? 'recovery' : 'invite'

  if (await isLinkSpent(token)) redirect('/auth/login')

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-10"><MotivLockup height={168} /></div>
          <div className="bg-[#17181e] rounded-2xl shadow-xl border border-white/10 p-6 sm:p-8">
            <ConfirmForm token={token} type={type} />
          </div>
        </div>
      </div>
    </div>
  )
}
