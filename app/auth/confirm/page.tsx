'use client'

import { useEffect, useState } from 'react'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { Button } from '@/components/ui/Button'
import { ShieldCheck } from 'lucide-react'

// Anti-prefetch landing for invite/recovery links. The email links HERE carrying
// the real Supabase verify URL in `redirect`. A scanner's GET just renders the
// button — the single-use token is only spent when the user clicks Continue and
// we navigate to the verify URL (which then lands on /auth/reset-password).
export default function ConfirmPage() {
  const [redirect, setRedirect] = useState<string | null>(null)
  const [type, setType] = useState('invite')
  const [error, setError] = useState('')
  const [going, setGoing] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const r = q.get('redirect') ?? ''
    // Only ever forward to a Supabase verify endpoint (blocks open redirects) —
    // validated by URL shape so it doesn't depend on a client-inlined env var.
    let u: URL | null = null
    try { u = new URL(r) } catch { u = null }
    const safe = !!u && u.protocol === 'https:' && u.hostname.endsWith('.supabase.co') && u.pathname === '/auth/v1/verify'
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read one-time confirm params from the URL on mount (client-only)
    setType(q.get('type') ?? 'invite')
    if (safe) setRedirect(r)
    else setError('This link is invalid. Please request a new one.')
  }, [])

  function go() {
    if (!redirect) return
    setGoing(true)
    window.location.href = redirect
  }

  const isRecovery = type === 'recovery'

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
              <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
            ) : (
              <Button onClick={go} loading={going} disabled={!redirect} className="w-full bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500" size="lg">
                Continue
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
