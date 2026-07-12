'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { CheckCircle2 } from 'lucide-react'

// Invite/recovery landing + set-password, all keyed to the one-time token from the
// email link (token_hash) — never a browser session. A scanner's GET just renders
// the form (token unspent); the token is verified server-side only on submit, and
// the password is set for the token's user, so it can never touch a logged-in
// account (this was the earlier admin-password bug).
export default function ConfirmPage() {
  const [token, setToken] = useState('')
  const [type, setType] = useState('invite')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read one-time confirm params from the URL on mount (client-only)
    setToken(q.get('t') ?? '')
    setType(q.get('type') === 'recovery' ? 'recovery' : 'invite')
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!token) { setError('This link is invalid. Please request a new one.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const res = await fetch('/api/auth/set-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: token, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error ?? 'Could not set your password. Please request a new link.'); setLoading(false); return }
    setLoading(false)
    setDone(true)
  }

  const isRecovery = type === 'recovery'

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-10"><MotivLockup height={120} /></div>
          <div className="bg-[#17181e] rounded-2xl shadow-xl border border-white/10 p-6 sm:p-8">
            {done ? (
              <div className="text-center space-y-3">
                <CheckCircle2 size={36} className="mx-auto text-green-500" />
                <h1 className="text-xl font-semibold text-white">Password set</h1>
                <p className="text-sm text-gray-400">You can now log in with your new password.</p>
                <Link href="/auth/login" className="inline-block mt-2">
                  <Button className="bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500">Go to login</Button>
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-white mb-1">{isRecovery ? 'Reset your password' : 'Set up your account'}</h1>
                <p className="text-sm text-gray-400 mb-6">Choose a password to {isRecovery ? 'reset your account' : 'activate your account and sign in'}.</p>
                <form onSubmit={submit} className="space-y-4">
                  <PasswordInput id="password" label="New Password" placeholder="Minimum 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
                  <PasswordInput id="confirm" label="Confirm Password" placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} />
                  {error && <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>}
                  <Button type="submit" loading={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500" size="lg">
                    {isRecovery ? 'Update password' : 'Set password'}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-gray-400">
                  <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Back to login</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
