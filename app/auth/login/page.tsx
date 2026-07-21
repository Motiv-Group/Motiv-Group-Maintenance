'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { clearCollapseState } from '@/lib/collapse-state'
import { isValidEmail } from '@/lib/csv'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { AuthShell } from '@/components/ui/AuthShell'
import { AuthError, AuthFooter } from '@/components/ui/AuthBits'
import { Turnstile, isTurnstileEnabled } from '@/components/ui/Turnstile'
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Widget load failure → fail OPEN client-side (Supabase enforcement is the
  // real gate); otherwise a blocked/unallowed-hostname widget locks everyone out.
  const [captchaFailed, setCaptchaFailed] = useState(false)
  // Bumped to remount the widget for a fresh token (Turnstile tokens are single-use).
  const [captchaKey, setCaptchaKey] = useState(0)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({ mode: 'onChange' })

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
    if (isTurnstileEnabled() && !captchaToken && !captchaFailed) { setError('Please complete the “I’m human” check.'); return }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      ...values,
      options: captchaToken ? { captchaToken } : undefined,
    })

    if (authError) {
      // Surfaced to the console (not the UI) so a stuck login can be diagnosed.
      console.warn('[login] sign-in failed:', authError.status, authError.message)
      const msg = authError.message.toLowerCase()
      setError(
        // A CAPTCHA rejection must NOT read as "wrong password" — that sent us on a
        // wild goose chase. Surface it distinctly so misconfig is obvious.
        msg.includes('captcha')
          ? 'Security check failed. Refresh the page, complete the “I’m human” box, then try again.'
          : msg.includes('email not confirmed')
          ? 'Please confirm your email first — check your inbox.'
          : 'Email or password is incorrect.'
      )
      setCaptchaToken(null); setCaptchaKey(k => k + 1) // fresh token for the retry
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
    else if (role === 'system_admin') dest = '/admin'
    else if (role === 'executive') dest = '/executive'
    else if (role === 'individual') dest = '/individual'
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
    <AuthShell logoHeight={152} cardMaxWidth={424}>
      <h1 className="text-[25px] font-semibold leading-tight text-white mb-1.5">Welcome back</h1>
      <p className="text-[13.5px] text-[#9299A8] mb-5">Sign in to continue to your workspace.</p>

      {/* Clearing the error on any field change keeps it from lingering while the
          user corrects their details. Fields carry their own message rows, so the
          form gap is tight — the premium rhythm comes from the per-element margins. */}
      <form onSubmit={handleSubmit(onSubmit)} onChange={() => { if (error) setError('') }} className="space-y-1.5">
        <Input
          id="email"
          type="email"
          tone="auth"
          label="Email address"
          placeholder="you@example.com"
          autoComplete="email"
          maxLength={200}
          error={errors.email?.message}
          {...register('email', {
            required: 'Email is required',
            maxLength: { value: 200, message: 'Email must be 200 characters or fewer' },
            validate: v => isValidEmail(v) || 'Enter a valid email address',
          })}
        />
        <PasswordInput
          id="password"
          tone="auth"
          label="Password"
          placeholder="Your password"
          autoComplete="current-password"
          maxLength={200}
          error={errors.password?.message}
          {...register('password', {
            required: 'Password is required',
            maxLength: { value: 200, message: 'Password must be 200 characters or fewer' },
          })}
        />

        <div className="flex items-center justify-between pt-0.5">
          {/* Custom checkbox — matches the button radius + brand blue instead of
              the browser-default control. */}
          <label className="flex items-center gap-2 text-[13px] text-gray-200 cursor-pointer select-none">
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
          <Link href="/auth/forgot-password" className="text-[13px] text-blue-400 hover:text-blue-300 hover:underline">
            Forgot password?
          </Link>
        </div>

        <div className="pt-1"><Turnstile key={captchaKey} onToken={setCaptchaToken} onLoadFailed={setCaptchaFailed} /></div>

        <AuthError message={error} />

        {/* Always clickable — required-field validation runs on submit. Gating on
            react-hook-form isValid left the button stuck disabled when the browser
            auto-filled the fields (e.g. after logout), which RHF never sees. */}
        <Button type="submit" variant="gold" loading={loading} className="w-full h-12 rounded-[10px] text-[14px] mt-1">
          Log in
        </Button>
      </form>

      <p className="mt-[18px] text-center text-[13px] text-gray-300">
        New to MOTIV?{' '}
        <Link href="/auth/signup" className="font-semibold text-blue-300 hover:text-blue-200 hover:underline">
          Create an account
        </Link>
      </p>

      <AuthFooter />
    </AuthShell>
  )
}
