'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { MotivLogo } from '@/components/ui/MotivLogo'
import { MailCheck } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    const supabase = createClient()
    // Don't reveal whether the email exists — always show the same result.
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
    }).catch(() => {})
    setLoading(false)
    setSent(true)
  }

  return (
    <div className="dark">
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center justify-center mb-10">
            <MotivLogo height={100} />
          </div>

          <div className="bg-gray-900 rounded-2xl shadow-xl border border-gray-700 p-6 sm:p-8">
            {sent ? (
              <div className="text-center space-y-3">
                <MailCheck size={36} className="mx-auto text-[#C6A35D]" />
                <h1 className="text-xl font-semibold text-white">Check your email</h1>
                <p className="text-sm text-gray-400">
                  If an account exists for <span className="text-gray-200">{email}</span>, we&apos;ve sent a link to reset your password.
                </p>
                <Link href="/auth/login" className="inline-block text-sm text-[#C6A35D] hover:underline font-medium mt-2">
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
                    onChange={e => setEmail(e.target.value)}
                  />
                  <Button type="submit" loading={loading} className="w-full bg-[#C6A35D] hover:bg-[#b8954f] text-white border-[#C6A35D] focus:ring-[#C6A35D]" size="lg" disabled={!email.trim()}>
                    Send reset link
                  </Button>
                </form>

                <p className="mt-4 text-center text-sm text-gray-400">
                  Remembered it?{' '}
                  <Link href="/auth/login" className="text-[#C6A35D] hover:underline font-medium">Log in</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
