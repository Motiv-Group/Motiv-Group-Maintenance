'use client'

import { useState } from 'react'
import Link from 'next/link'
import { isValidEmail } from '@/lib/csv'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { MailCheck } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [err, setErr]         = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValidEmail(email)) { setErr('Enter a valid email address'); return }
    setErr('')
    setLoading(true)
    // Our API generates the recovery link and sends the branded email via Resend
    // (from hello@motivgroup.co.za). Always the same result — no email disclosure.
    await fetch('/api/auth/forgot-password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => {})
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="dark">
      <div className="min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-10">
            <MotivLockup height={168} />
          </div>

          <div className="bg-[#17181e] rounded-2xl shadow-xl border border-white/10 p-6 sm:p-8">
            {sent ? (
              <div className="text-center space-y-3">
                <MailCheck size={36} className="mx-auto text-emerald-500" />
                <h1 className="text-xl font-semibold text-white">Check your email</h1>
                <p className="text-sm text-gray-400">
                  If an account exists for <span className="text-gray-200">{email}</span>, we&apos;ve sent a link to reset your password.
                </p>
                <Link href="/auth/login" className="inline-block text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium mt-2">
                  Back to login
                </Link>
              </div>
            ) : (
              <>
                <h1 className="text-xl font-semibold text-white mb-1">Reset your password</h1>
                <p className="text-sm text-gray-400 mb-6">Enter your email and we&apos;ll send you a reset link.</p>

                <form onSubmit={submit} className="space-y-4">
                  <Input
                    id="email"
                    type="email"
                    label="Email Address"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => { setEmail(e.target.value); if (err) setErr('') }}
                    error={err || undefined}
                  />
                  <Button type="submit" loading={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white border-blue-600 focus:ring-blue-500" size="lg" disabled={!email.trim()}>
                    Send reset link
                  </Button>
                </form>

                <p className="mt-4 text-center text-sm text-gray-400">
                  Remembered it?{' '}
                  <Link href="/auth/login" className="text-blue-600 dark:text-blue-400 hover:underline font-medium">Log in</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
