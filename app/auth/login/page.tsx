'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { clearCollapseState } from '@/lib/collapse-state'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { AuthShell } from '@/components/ui/AuthShell'
import { AuthError, AuthFooter } from '@/components/ui/AuthBits'
import { Check } from 'lucide-react'

interface LoginForm {
  email: string
  password: string
}

// "Remember me" prefills the email next visit. Supabase already keeps the
// session alive across restarts by default, so remembering the address is the
// genuinely additive win for daily users — and it never touches auth/session
// mechanics, so it can't lock anyone out.
const REMEMBER_KEY = 'motiv:remembered-email'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [forwarding, setForwarding] = useState(false)
  const [remember, setRemember] = useState(true)

  // mode:'onChange' makes formState.isValid reactive so we can gate the submit
  // button on the required fields being filled (both registered as required).
  const { register, handleSubmit, setValue, formState: { errors, isValid } } = useForm<LoginForm>({ mode: 'onChange' })

  // Prefill a remembered email address (remember defaults to true already).
  // Wrapped in try/catch like the write path — localStorage throws when the
  // browser blocks all site data, and an unguarded throw in an effect would
  // crash the login page.
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const saved = window.localStorage.getItem(REMEMBER_KEY)
      // shouldValidate so a prefilled email counts toward isValid immediately.
      if (saved) setValue('email', saved, { shouldValidate: true })
    } catch { /* storage disabled — ignore */ }
  }, [setValue])

  // Supabase invite/recovery links land here (their generateLink ignores
  // redirect_to and uses the Site URL). The token arrives in the URL hash and
  // detectSessionInUrl establishes a session — so detect it and forward the
  // user to the right place: suppliers complete onboarding, everyone else sets
  // a password.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash
    if (!/access_token=|type=(invite|recovery)/.test(hash)) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only init from URL hash (Supabase invite/recovery token); cannot run during SSR render
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
      // Surfaced to the console (not the UI) so a stuck login can be diagnosed.
      console.warn('[login] sign-in failed:', authError.status, authError.message)
      setError(
        authError.message.toLowerCase().includes('email not confirmed')
          ? 'Please confirm your email first — check your inbox.'
          : 'Email or password is incorrect.'
      )
      setLoading(false)
      return
    }

    // Persist / forget the email per the "Remember me" choice.
    try {
      if (remember) window.localStorage.setItem(REMEMBER_KEY, values.email)
      else window.localStorage.removeItem(REMEMBER_KEY)
    } catch { /* storage disabled — ignore */ }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    // Fresh session → reset any remembered collapsible-section state to defaults.
    clearCollapseState()

    const role = profile?.role
    let dest = '/client'
    if (role === 'supplier') dest = '/supplier'
    else if (role === 'regional_manager') dest = '/regional'
    else if (role === 'executive' || role === 'system_admin') dest = '/executive'
    router.push(dest)
    router.refresh()
  }

  if (forwarding) {
    return (
      <div className="dark min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center gap-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        <p className="text-sm text-gray-400">Completing your invite…</p>
      </div>
    )
  }

  return (
    <AuthShell logoHeight={260} raise={40}>
      <h1 className="text-xl sm:text-2xl font-semibold text-white mb-1">Welcome back</h1>
      <p className="text-sm text-gray-300 mb-6">Sign in to continue to your workspace.</p>

      {/* Clearing the error on any field change keeps it from lingering while the
          user corrects their details. */}
      <form onSubmit={handleSubmit(onSubmit)} onChange={() => { if (error) setError('') }} className="space-y-4">
        <Input
          id="email"
          type="email"
          tone="auth"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email', { required: 'Email is required' })}
        />
        <PasswordInput
          id="password"
          tone="auth"
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password', { required: 'Password is required' })}
        />

        <div className="flex items-center justify-between">
          {/* Custom checkbox — matches the button radius + brand blue instead of
              the browser-default control. */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <span className="relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="peer absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
              />
              <span className="absolute inset-0 rounded-md border border-[#3a3d47] bg-[#20222b] transition-colors peer-checked:border-blue-500 peer-checked:bg-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-0" />
              <Check size={12} strokeWidth={3.5} className="pointer-events-none relative text-white opacity-0 transition-opacity peer-checked:opacity-100" />
            </span>
            Remember me
          </label>
          <Link href="/auth/forgot-password" className="text-sm text-blue-400 hover:text-blue-300 hover:underline">
            Forgot password?
          </Link>
        </div>

        <AuthError message={error} />

        {/* Confident enabled state (brighter, bolder); a clearly-neutral disabled
            state is reserved for the incomplete form (not just a dimmed blue). */}
        <Button
          type="submit"
          variant="gold"
          loading={loading}
          disabled={!isValid}
          size="lg"
          className="w-full font-semibold text-white shadow-sm shadow-blue-950/40 disabled:opacity-100 disabled:bg-[#1c1f27] disabled:text-gray-500 disabled:shadow-none"
        >
          Log in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-gray-400">
        New to MOTIV?{' '}
        <Link href="/auth/signup" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">
          Create an account
        </Link>
      </p>

      <AuthFooter />
    </AuthShell>
  )
}
