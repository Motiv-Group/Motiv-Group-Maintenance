'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { AuthShell } from '@/components/ui/AuthShell'
import { AuthError } from '@/components/ui/AuthBits'
import { CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)
  // The token of the account being set — read STRAIGHT from the invite/recovery
  // link (URL hash), never from the browser session. Otherwise, if someone (e.g.
  // an admin) is already logged in, we'd set THEIR password instead of the
  // invitee's. Fall back to getSession() only for the login-page-redirect path
  // that consumes the hash first.
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const at = h.get('access_token')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capture the invite/recovery token from the URL hash before anything consumes it
    if (at) { setToken(at); return }
    createClient().auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null)).catch(() => {})
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }
    if (!token) {
      setError('Your reset link has expired or is invalid. Please request a new one.')
      return
    }

    setLoading(true)
    // Set the password server-side via the admin API, keyed to the token from the
    // link — so it always targets the invited/recovering user, never a logged-in one.
    const res = await fetch('/api/auth/set-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken: token, password }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Could not set your password. Please request a new link.')
      setLoading(false)
      return
    }
    setLoading(false)
    setDone(true)
  }

  return (
    <AuthShell>
      {done ? (
        <div className="text-center space-y-3">
          <CheckCircle2 size={36} className="mx-auto text-green-500" />
          <h1 className="text-xl font-semibold text-white">Password updated</h1>
          <p className="text-sm text-gray-400">You can now log in with your new password.</p>
          <Link href="/auth/login" className="inline-block mt-2">
            <Button className="bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500">Go to login</Button>
          </Link>
        </div>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-white mb-1">Set a new password</h1>
          <p className="text-sm text-gray-400 mb-6">Choose a new password for your account.</p>

          <form onSubmit={submit} onChange={() => { if (error) setError('') }} className="space-y-4">
            <PasswordInput
              id="password"
              tone="auth"
              label="New password"
              placeholder="Minimum 8 characters"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <PasswordInput
              id="confirm"
              tone="auth"
              label="Confirm password"
              placeholder="Repeat your password"
              autoComplete="new-password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />

            <AuthError message={error} />

            <Button type="submit" loading={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500" size="lg">
              Update password
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-400">
            <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">Back to login</Link>
          </p>
        </>
      )}
    </AuthShell>
  )
}
