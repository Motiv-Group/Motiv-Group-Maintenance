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
import { User, Truck, Mail, ArrowRight } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'

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

  const { register, handleSubmit, watch, formState: { errors } } = useForm<SignupForm>()

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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-8"><MotivLogo height={72} /></div>
          <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C6A35D]/10"><Mail size={24} className="text-[#C6A35D]" /></div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Check your email</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">We&apos;ve sent a verification link to</p>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-5 break-all">{sentTo}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Click the link in that email to activate your account, then log in. Check your spam folder if it doesn&apos;t arrive within a minute.</p>
            <Link href="/auth/login" className="inline-block w-full rounded-xl bg-[#C6A35D] px-4 py-3 text-center font-medium text-[#0a0e17] hover:opacity-90 transition-opacity">Go to login</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8"><MotivLogo height={72} /></div>

        <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Choose the type of account to get started.</p>

          {/* Account-type toggle */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            {([
              { value: 'individual', label: 'Individual', icon: User,  desc: 'Log & manage your own jobs' },
              { value: 'supplier',   label: 'Supplier',   icon: Truck, desc: 'Trade / maintenance company' },
            ] as const).map(opt => (
              <button key={opt.value} type="button" onClick={() => { setChoice(opt.value); setError('') }}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                  choice === opt.value ? 'border-[#C6A35D] bg-[#C6A35D]/10' : 'border-gray-200 dark:border-gray-700 hover:border-[#C6A35D]/60'
                }`}>
                <opt.icon size={20} className="text-[#C6A35D]" />
                <span className={`text-sm font-medium ${choice === opt.value ? 'text-[#C6A35D]' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</span>
                <span className="text-xs text-gray-400">{opt.desc}</span>
              </button>
            ))}
          </div>

          {choice === 'supplier' ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400">Suppliers register with their company and trade details. Continue to the supplier onboarding to set up your account.</p>
              <Link href="/auth/supplier-onboard" className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#C6A35D] px-4 py-3 font-medium text-[#0a0e17] hover:opacity-90 transition-opacity">
                Continue as Supplier <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input id="full_name" label="Full Name" placeholder="Jane Smith" error={errors.full_name?.message}
                {...register('full_name', { required: 'Full name is required' })} />
              <Input id="email" type="email" label="Email Address" placeholder="jane@email.com" error={errors.email?.message}
                {...register('email', { required: 'Email is required', validate: v => isValidEmail(v) || 'Enter a valid email address' })} />
              <Input id="phone" type="tel" label="Phone Number" placeholder="+27 71 234 5678" error={errors.phone?.message}
                {...register('phone', { required: 'Phone number is required', validate: v => isValidPhone(v) || 'Enter a valid phone number' })} />
              <Input id="address" label="Address" placeholder="123 Main St, Cape Town" error={errors.address?.message}
                {...register('address', { required: 'Address is required' })} />
              <PasswordInput id="password" label="Password" placeholder="Minimum 8 characters" error={errors.password?.message}
                {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' } })} />
              <PasswordInput id="confirm_password" label="Confirm Password" placeholder="Repeat your password" error={errors.confirm_password?.message}
                {...register('confirm_password', { required: 'Please confirm your password', validate: val => val === watch('password') || 'Passwords do not match' })} />

              {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>}

              <Button type="submit" loading={loading} className="w-full" size="lg">Create Account</Button>
            </form>
          )}

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[#C6A35D] hover:underline font-medium">Log in</Link>
          </p>
          <p className="mt-2 text-center text-xs text-gray-400">Store, Regional Manager &amp; Executive accounts are set up by invitation.</p>
        </div>
      </div>
    </div>
  )
}
