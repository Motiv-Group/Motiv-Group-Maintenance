'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail, isValidPhone } from '@/lib/csv'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { AuthShell } from '@/components/ui/AuthShell'
import { AuthError, AuthFooter } from '@/components/ui/AuthBits'
import { Turnstile, isTurnstileEnabled } from '@/components/ui/Turnstile'
import { User, Truck, Mail, ArrowRight, Check } from 'lucide-react'

// Self-service signup is for Individuals (general public) and Suppliers only.
// Store Managers, Regional Managers and Executives are invited by an admin.
type Choice = 'individual' | 'supplier'

import { CONSENT_VERSION } from '@/lib/consent'

interface SignupForm {
  full_name: string
  email:     string
  phone:     string
  address:   string
  password:  string
  confirm_password: string
  consent:   boolean
}

export default function SignupPage() {
  const router = useRouter()
  const [choice, setChoice] = useState<Choice>('individual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  // Widget load failure → fail OPEN client-side (Supabase enforcement is the
  // real gate); otherwise a blocked/unallowed-hostname widget locks everyone out.
  const [captchaFailed, setCaptchaFailed] = useState(false)
  const [captchaKey, setCaptchaKey] = useState(0) // remount widget for a fresh single-use token

  // mode:'onChange' makes isValid reactive so the submit button can gate on the
  // required fields being valid.
  const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm<SignupForm>({ mode: 'onChange' })

  // Live password requirements — shown as a checklist and enforced by the field
  // validator below (so the submit button stays gated until all are met).
  const pw = watch('password') || ''
  const pwChecks = [
    { label: '8+ characters', ok: pw.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'Number', ok: /[0-9]/.test(pw) },
    { label: 'Special character', ok: /[^A-Za-z0-9]/.test(pw) },
  ]

  async function onSubmit(values: SignupForm) {
    if (isTurnstileEnabled() && !captchaToken && !captchaFailed) { setError('Please complete the “I’m human” check.'); return }
    setLoading(true); setError('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        captchaToken: captchaToken ?? undefined,
        data: {
          full_name: values.full_name,
          phone:     values.phone,
          address:   values.address,
          company_name: null,
          sub_store: null,
          branch_code: null,
          role: 'individual',
          // POPIA (OPS-006): record affirmative consent + version at signup.
          consent_version: CONSENT_VERSION,
          consent_accepted_at: new Date().toISOString(),
        },
      },
    })
    if (authError) { setError(authError.message); setCaptchaToken(null); setCaptchaKey(k => k + 1); setLoading(false); return }

    // Email confirmation on → no session yet; show a "check your email" screen.
    if (!data.session) { setSentTo(values.email); setLoading(false); return }

    // Live session → enforce the profile fields, then land on the Individual home.
    await fetch('/api/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: values.full_name, phone: values.phone, address: values.address, company_name: null, sub_store: null, branch_code: null, role: 'individual' }),
    })
    router.push('/individual')
  }

  if (sentTo) {
    return (
      <AuthShell maxWidth="md">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10"><Mail size={24} className="text-emerald-500" /></div>
          <h1 className="text-xl font-semibold text-white mb-2">Check your email</h1>
          <p className="text-sm text-gray-400 mb-1">We&apos;ve sent a verification link to</p>
          <p className="text-sm font-medium text-white mb-5 break-all">{sentTo}</p>
          <p className="text-sm text-gray-400 mb-6">Click the link in that email to activate your account, then log in. Check your spam folder if it doesn&apos;t arrive within a minute.</p>
          <Link href="/auth/login" className="inline-block w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 text-center font-medium text-white transition-colors">Go to login</Link>
        </div>
        <AuthFooter />
      </AuthShell>
    )
  }

  return (
    <AuthShell maxWidth="lg" logoHeight={138}>
      <h1 className="text-xl font-semibold text-white mb-1">Create your account</h1>
      <p className="text-sm text-gray-300 mb-5">Choose the type of account to get started.</p>

      {/* Account-type toggle */}
      <div className="grid grid-cols-2 gap-2.5 mb-3">
        {([
          { value: 'individual', label: 'Individual', icon: User,  desc: 'Log and manage maintenance jobs' },
          { value: 'supplier',   label: 'Supplier',   icon: Truck, desc: 'Receive and complete maintenance work' },
        ] as const).map(opt => (
          <button key={opt.value} type="button" onClick={() => { setChoice(opt.value); setError('') }}
            className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border-2 text-center transition-all ${
              choice === opt.value ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-emerald-500/60'
            }`}>
            <opt.icon size={22} className={choice === opt.value ? 'text-emerald-400' : 'text-gray-200'} />
            <span className={`text-sm font-semibold ${choice === opt.value ? 'text-emerald-400' : 'text-gray-100'}`}>{opt.label}</span>
            <span className="text-[13px] leading-snug text-gray-200">{opt.desc}</span>
          </button>
        ))}
      </div>

      {/* Invitation notice — placed by the selector so it's not missed. */}
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-3">
        <p className="text-[13px] font-semibold text-gray-100">Need a management account?</p>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-200">
          Store Managers, Regional Managers and Executives receive an invitation from their administrator. Request access at{' '}
          <a href="mailto:info@motivgroup.co.za?subject=Motiv%20account%20access%20request" className="font-medium text-blue-400 hover:text-blue-300 hover:underline">info@motivgroup.co.za</a>.
        </p>
      </div>

      {choice === 'supplier' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-300">Suppliers register with their company and trade details. Continue to the supplier onboarding to set up your account.</p>
          <Link href="/auth/supplier-onboard" className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 font-medium text-white transition-colors">
            Continue as Supplier <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} onChange={() => { if (error) setError('') }} className="space-y-3">
          {/* Two columns on sm+, one column on phones. DOM order gives the pairs
              Full name | Phone, Email | Address, Password | Confirm. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
            <Input id="full_name" tone="auth" label="Full name" placeholder="Jane Smith" autoComplete="name" error={errors.full_name?.message}
              {...register('full_name', { required: 'Full name is required' })} />
            <Input id="phone" type="tel" tone="auth" label="Phone number" placeholder="+27 71 234 5678" autoComplete="tel" error={errors.phone?.message}
              {...register('phone', { required: 'Phone number is required', validate: v => isValidPhone(v) || 'Enter a valid phone number' })} />
            <Input id="email" type="email" tone="auth" label="Email address" placeholder="jane@email.com" autoComplete="email" error={errors.email?.message}
              {...register('email', { required: 'Email is required', validate: v => isValidEmail(v) || 'Enter a valid email address' })} />
            <Input id="address" tone="auth" label="Address" placeholder="123 Main St, Cape Town" autoComplete="street-address" error={errors.address?.message}
              {...register('address', { required: 'Address is required' })} />
            {/* Password feedback is the checklist below, so no inline error here. */}
            <PasswordInput id="password" tone="auth" label="Password" placeholder="Create a password" autoComplete="new-password"
              {...register('password', { required: 'Password is required', validate: v => (v.length >= 8 && /[A-Z]/.test(v) && /[0-9]/.test(v) && /[^A-Za-z0-9]/.test(v)) || 'Meet all the requirements below' })} />
            {/* eslint-disable react-hooks/incompatible-library -- compiler skips this component; runtime unaffected (React Compiler not enabled) */}
            <PasswordInput id="confirm_password" tone="auth" label="Confirm password" placeholder="Repeat your password" autoComplete="new-password" error={errors.confirm_password?.message}
              {...register('confirm_password', { required: 'Please confirm your password', validate: val => val === watch('password') || 'Passwords do not match' })} />
            {/* eslint-enable react-hooks/incompatible-library */}
          </div>

          {/* Live password requirements — a check per rule, muted grey until met
              then green (the icon inherits the row colour). */}
          <ul className="flex flex-wrap gap-x-4 gap-y-1 -mt-1">
            {pwChecks.map(c => (
              <li key={c.label} className={`flex items-center gap-1.5 text-xs transition-colors ${c.ok ? 'text-emerald-400' : 'text-gray-300'}`}>
                <Check size={13} strokeWidth={3} className="shrink-0" />
                {c.label}
              </li>
            ))}
          </ul>

          {/* POPIA consent — required; gates the submit button (isValid). */}
          <label className="flex items-start gap-2.5 text-[13px] leading-snug text-gray-300 mt-1">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              {...register('consent', { required: true })} />
            <span>
              I agree to the{' '}
              <Link href="/privacy" target="_blank" className="text-blue-400 hover:text-blue-300 hover:underline">Privacy Policy</Link>{' '}and{' '}
              <Link href="/terms" target="_blank" className="text-blue-400 hover:text-blue-300 hover:underline">Terms of Service</Link>, and consent to Motiv processing my personal information to provide the service.
            </span>
          </label>

          <Turnstile key={captchaKey} onToken={setCaptchaToken} onLoadFailed={setCaptchaFailed} />

          <AuthError message={error} />

          <Button type="submit" variant="gold" loading={loading} disabled={!isValid} className="w-full" size="lg">Create account</Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-gray-300">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">Log in</Link>
      </p>

      <AuthFooter />
    </AuthShell>
  )
}
