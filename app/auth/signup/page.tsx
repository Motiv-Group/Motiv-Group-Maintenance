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
import { User, Truck, Mail, ArrowRight } from 'lucide-react'

// Self-service signup is for Individuals (general public) and Suppliers only.
// Store Managers, Regional Managers and Executives are invited by an admin.
type Choice = 'individual' | 'supplier'

interface SignupForm {
  full_name: string
  email:     string
  phone:     string
  address:   string
  password:  string
  confirm_password: string
}

export default function SignupPage() {
  const router = useRouter()
  const [choice, setChoice] = useState<Choice>('individual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)

  // mode:'onChange' makes isValid reactive so the submit button can gate on the
  // required fields being valid.
  const { register, handleSubmit, watch, formState: { errors, isValid } } = useForm<SignupForm>({ mode: 'onChange' })

  async function onSubmit(values: SignupForm) {
    setLoading(true); setError('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.full_name,
          phone:     values.phone,
          address:   values.address,
          company_name: null,
          sub_store: null,
          branch_code: null,
          role: 'individual',
        },
      },
    })
    if (authError) { setError(authError.message); setLoading(false); return }

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
    <AuthShell maxWidth="md">
      <h1 className="text-xl font-semibold text-white mb-1">Create your account</h1>
      <p className="text-sm text-gray-400 mb-5">Choose the type of account to get started.</p>

      {/* Account-type toggle */}
      <div className="grid grid-cols-2 gap-2 mb-6">
        {([
          { value: 'individual', label: 'Individual', icon: User,  desc: 'Log & manage your own jobs' },
          { value: 'supplier',   label: 'Supplier',   icon: Truck, desc: 'Trade / maintenance company' },
        ] as const).map(opt => (
          <button key={opt.value} type="button" onClick={() => { setChoice(opt.value); setError('') }}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
              choice === opt.value ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-emerald-500/60'
            }`}>
            <opt.icon size={20} className={choice === opt.value ? 'text-emerald-400' : 'text-gray-400'} />
            <span className={`text-sm font-medium ${choice === opt.value ? 'text-emerald-400' : 'text-gray-300'}`}>{opt.label}</span>
            <span className="text-xs text-gray-400">{opt.desc}</span>
          </button>
        ))}
      </div>

      {choice === 'supplier' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Suppliers register with their company and trade details. Continue to the supplier onboarding to set up your account.</p>
          <Link href="/auth/supplier-onboard" className="flex items-center justify-center gap-2 w-full rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-3 font-medium text-white transition-colors">
            Continue as Supplier <ArrowRight size={16} />
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} onChange={() => { if (error) setError('') }} className="space-y-3">
          <Input id="full_name" tone="auth" label="Full name" placeholder="Jane Smith" autoComplete="name" error={errors.full_name?.message}
            {...register('full_name', { required: 'Full name is required' })} />
          <Input id="email" type="email" tone="auth" label="Email address" placeholder="jane@email.com" autoComplete="email" error={errors.email?.message}
            {...register('email', { required: 'Email is required', validate: v => isValidEmail(v) || 'Enter a valid email address' })} />
          <Input id="phone" type="tel" tone="auth" label="Phone number" placeholder="+27 71 234 5678" autoComplete="tel" error={errors.phone?.message}
            {...register('phone', { required: 'Phone number is required', validate: v => isValidPhone(v) || 'Enter a valid phone number' })} />
          <Input id="address" tone="auth" label="Address" placeholder="123 Main St, Cape Town" autoComplete="street-address" error={errors.address?.message}
            {...register('address', { required: 'Address is required' })} />
          <PasswordInput id="password" tone="auth" label="Password" placeholder="Minimum 8 characters" autoComplete="new-password" error={errors.password?.message}
            {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' } })} />
          {/* eslint-disable react-hooks/incompatible-library -- compiler skips this component; runtime unaffected (React Compiler not enabled) */}
          <PasswordInput id="confirm_password" tone="auth" label="Confirm password" placeholder="Repeat your password" autoComplete="new-password" error={errors.confirm_password?.message}
            {...register('confirm_password', { required: 'Please confirm your password', validate: val => val === watch('password') || 'Passwords do not match' })} />
          {/* eslint-enable react-hooks/incompatible-library */}

          <AuthError message={error} />

          <Button type="submit" variant="gold" loading={loading} disabled={!isValid} className="w-full" size="lg">Create account</Button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-gray-400">
        Already have an account?{' '}
        <Link href="/auth/login" className="text-blue-400 hover:text-blue-300 hover:underline font-medium">Log in</Link>
      </p>
      <p className="mt-2 text-center text-xs text-gray-400">Store, Regional Manager &amp; Executive accounts are set up by invitation.</p>

      <AuthFooter />
    </AuthShell>
  )
}
