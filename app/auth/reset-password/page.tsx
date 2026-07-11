'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { CheckCircle2 } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8)   { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm)  { setError('Passwords do not match.'); return }

    setLoading(true)
    const supabase = createClient()
    const { error: updErr } = await supabase.auth.updateUser({ password })
    if (updErr) {
      setError(/session|missing|expired|invalid|jwt/i.test(updErr.message)
        ? 'Your reset link has expired or is invalid. Please request a new one.'
        : updErr.message)
      setLoading(false)
      return
    }
    await supabase.auth.signOut().catch(() => {})
    setLoading(false)
    setDone(true)
  }

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-10">
            <MotivLockup height={120} />
          </div>

          <div className="bg-[#17181e] rounded-2xl shadow-xl border border-white/10 p-6 sm:p-8">
            {done ? (
              <div className="text-center space-y-3">
                <CheckCircle2 size={36} className="mx-auto text-green-500" />
                <h1 className="text-xl font-semibold text-white">Password updated</h1>
                <p className="text-sm text-gray-400">You can now log in with your new password.</p>
                <Link href="/auth/login" className="inline-block mt-2">
                  <Button className="bg-[#C6A35D] hover:bg-[#b8954f] text-white border-[#C6A35D] focus:ring-[#C6A35D]">Go to login</Button>
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-white mb-1">Set a new password</h1>
                <p className="text-sm text-gray-400 mb-6">Choose a new password for your account.</p>

                <form onSubmit={submit} className="space-y-4">
                  <PasswordInput
                    id="password"
                    label="New Password"
                    placeholder="Minimum 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                  />
                  <PasswordInput
                    id="confirm"
                    label="Confirm Password"
                    placeholder="Repeat your password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                  />

                  {error && (
                    <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3">
                      {error}
                    </div>
                  )}

                  <Button type="submit" loading={loading} className="w-full bg-[#C6A35D] hover:bg-[#b8954f] text-white border-[#C6A35D] focus:ring-[#C6A35D]" size="lg">
                    Update password
                  </Button>
                </form>

                <p className="mt-4 text-center text-sm text-gray-400">
                  <Link href="/auth/login" className="text-[#C6A35D] hover:underline font-medium">Back to login</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
