'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { Button } from '@/components/ui/Button'
import { ShieldCheck } from 'lucide-react'

// Anti-prefetch landing for invite/recovery links. The email links HERE (not the
// Supabase verify URL), so an email scanner's GET just renders the button — the
// single-use token is only spent when the user actually clicks Continue. On click
// we verifyOtp (establishing the invitee's session) and forward to set-password.
export default function ConfirmPage() {
  const router = useRouter()
  const [params, setParams] = useState<{ tokenHash: string; type: string; next: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const tokenHash = q.get('token_hash') ?? ''
    const type = q.get('type') ?? 'invite'
    let next = q.get('next') ?? '/auth/reset-password'
    if (!next.startsWith('/') || next.startsWith('//')) next = '/auth/reset-password'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read one-time confirm params from the URL on mount (client-only)
    setParams({ tokenHash, type, next })
  }, [])

  async function confirm() {
    if (!params?.tokenHash) { setError('This link is invalid. Please request a new one.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type as 'invite' | 'recovery' | 'email' })
    if (vErr) {
      setError('This link has expired or was already used. Please request a new one.')
      setLoading(false)
      return
    }
    router.replace(params.next)
  }

  const isRecovery = params?.type === 'recovery'

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-10"><MotivLockup height={120} /></div>
          <div className="bg-[#17181e] rounded-2xl shadow-xl border border-white/10 p-6 sm:p-8 text-center">
            <ShieldCheck size={34} className="mx-auto text-blue-500 mb-3" />
            <h1 className="text-xl font-semibold text-white mb-1">{isRecovery ? 'Reset your password' : 'Set up your account'}</h1>
            <p className="text-sm text-gray-400 mb-6">Click continue to {isRecovery ? 'choose a new password' : 'activate your account and set a password'}.</p>

            {error ? (
              <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3 mb-4">{error}</div>
            ) : null}

            <Button onClick={confirm} loading={loading} disabled={!params} className="w-full bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500" size="lg">
              Continue
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
