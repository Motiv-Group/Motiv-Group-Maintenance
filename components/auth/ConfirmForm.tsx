'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { CheckCircle2 } from 'lucide-react'

// Set-password form for an invite/recovery link. The token + type come from the
// server page (which already redirected a spent link to login). The token is
// still verified server-side on submit — the client never trusts it.
export function ConfirmForm({ token, type }: { token: string; type: 'invite' | 'recovery' }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const isRecovery = type === 'recovery'

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
    setLoading(false); setDone(true)
  }

  if (done) {
    return (
      <div className="text-center space-y-3">
        <CheckCircle2 size={36} className="mx-auto text-green-500" />
        <h1 className="text-xl font-semibold text-white">Password set</h1>
        <p className="text-sm text-gray-400">You can now log in with your new password.</p>
        <Link href="/auth/login" className="inline-block mt-2">
          <Button className="bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500">Go to login</Button>
        </Link>
      </div>
    )
  }

  return (
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
  )
}
