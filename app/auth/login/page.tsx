'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { MotivLogo } from '@/components/ui/MotivLogo'

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forwarding, setForwarding] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()

  // Supabase invite/recovery links land here (their generateLink ignores
  // redirect_to and uses the Site URL). The token arrives in the URL hash and
  // detectSessionInUrl establishes a session — so detect it and forward the
  // user to the right place: suppliers complete onboarding, everyone else sets
  // a password.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!/access_token=|type=(invite|recovery)/.test(hash)) return
    setForwarding(true)
    const type = new URLSearchParams(hash.replace(/^#/, '')).get('type')
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user
      if (!user) { setForwarding(false); return }
      const role = (user.user_metadata as { role?: string } | null)?.role
      if (type === 'invite' && role === 'supplier') router.replace('/auth/supplier-onboard')
      else router.replace('/auth/reset-password') // RM invite / password recovery
    }).catch(() => setForwarding(false))
  }, [router])

  async function onSubmit(values: LoginForm) {
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword(values)

    if (authError) {
      setError(
        authError.message.toLowerCase().includes('email not confirmed')
          ? 'Please confirm your email first — check your inbox.'
          : 'Invalid email or password.'
      )
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    const role = profile?.role
    let dest = '/client'
    if (role === 'supplier') dest = '/supplier'
    else if (role === 'regional_manager') dest = '/regional'
    else if (role === 'executive' || role === 'system_admin') dest = '/executive'
    router.push(dest)
    router.refresh()
  }

  // Always dark — force the dark class on this page's wrapper regardless of theme
  if (forwarding) {
    return (
      <div className="dark min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C6A35D]" />
        <p className="text-sm text-gray-400">Completing your invite…</p>
      </div>
    )
  }

  return (
    <div className="dark">
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Logo — larger and centred */}
          <div className="flex items-center justify-center mb-10">
            <MotivLogo height={100} />
          </div>

          <div className="bg-gray-900 rounded-2xl shadow-xl border border-gray-700 p-6 sm:p-8">
            <h1 className="text-xl font-semibold text-white mb-1">Welcome back</h1>
            <p className="text-sm text-gray-400 mb-6">Log in to your account.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                id="email"
                type="email"
                label="Email Address"
                placeholder="you@example.com"
                error={errors.email?.message}
                {...register('email', { required: 'Email is required' })}
              />
              <PasswordInput
                id="password"
                label="Password"
                placeholder="Your password"
                error={errors.password?.message}
                {...register('password', { required: 'Password is required' })}
              />

              <div className="text-right -mt-1">
                <Link href="/auth/forgot-password" className="text-xs text-[#C6A35D] hover:underline">
                  Forgot password?
                </Link>
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                Log In
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-gray-400">
              New here?{' '}
              <Link href="/auth/signup" className="text-brand-300 hover:underline font-medium">
                Create an account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
