'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { Users, Briefcase, Mail } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'

type Role = 'regional_manager' | 'executive'

interface SignupForm {
  full_name:    string
  email:        string
  phone:        string
  address:      string
  company_name: string
  region_code:  string
  password:     string
  confirm_password: string
}

export default function SignupPage() {
  const router  = useRouter()
  const [role,    setRole]    = useState<Role>('regional_manager')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [sentTo,  setSentTo]  = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<SignupForm>()

  function switchRole(r: Role) {
    setRole(r)
    setError('')
  }

  async function onSubmit(values: SignupForm) {
    setLoading(true)
    setError('')

    const supabase = createClient()

    const { data, error: authError } = await supabase.auth.signUp({
      email:    values.email,
      password: values.password,
      options: {
        data: {
          full_name:    values.full_name,
          phone:        values.phone,
          address:      values.address,
          company_name: values.company_name,
          sub_store:    null,
          branch_code:  null,
          // RMs join an executive's company via their region code (approved later).
          requested_region_code: role === 'regional_manager' ? (values.region_code ?? '').trim().toUpperCase() : null,
          role,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Email confirmation enabled → signUp returns a user but no session. The
    // account isn't usable (and protected routes will bounce) until the user
    // clicks the verification link, so show a "check your email" state instead
    // of redirecting. Profile fields are carried in the signUp metadata above,
    // so the DB trigger populates user_profiles on confirm.
    if (!data.session) {
      setSentTo(values.email)
      setLoading(false)
      return
    }

    // No confirmation required → we have a live session. Enforce the profile
    // fields, then drop the user on their dashboard.
    await fetch('/api/profile', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name:    values.full_name,
        phone:        values.phone,
        address:      values.address,
        company_name: values.company_name,
        sub_store:    null,
        branch_code:  null,
        role,
      }),
    })

    router.push(role === 'executive' ? '/executive' : '/regional')
  }

  if (sentTo) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-8">
            <MotivLogo height={72} />
          </div>

          <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#C6A35D]/10">
              <Mail size={24} className="text-[#C6A35D]" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Check your email</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
              We&apos;ve sent a verification link to
            </p>
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-5 break-all">{sentTo}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Click the link in that email to activate your account, then log in. Check your spam folder if it doesn&apos;t arrive within a minute.
            </p>
            <Link
              href="/auth/login"
              className="inline-block w-full rounded-xl bg-[#C6A35D] px-4 py-3 text-center font-medium text-[#0a0e17] hover:opacity-90 transition-opacity"
            >
              Go to login
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8">
          <MotivLogo height={72} />
        </div>

        <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Create your account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Choose your role to get started.</p>

          {/* Role toggle */}
          <div className="grid grid-cols-2 gap-2 mb-6">
            {([
              { value: 'regional_manager', label: 'Regional Manager', icon: Users,     desc: 'Oversee multiple stores' },
              { value: 'executive',        label: 'Executive',        icon: Briefcase, desc: 'Estate-wide dashboards' },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => switchRole(opt.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition-all ${
                  role === opt.value
                    ? 'border-[#C6A35D] bg-[#C6A35D]/10'
                    : 'border-gray-200 dark:border-gray-700 hover:border-[#C6A35D]/60'
                }`}
              >
                <opt.icon size={20} className="text-[#C6A35D]" />
                <span className={`text-sm font-medium ${role === opt.value ? 'text-[#C6A35D]' : 'text-gray-700 dark:text-gray-300'}`}>
                  {opt.label}
                </span>
                <span className="text-xs text-gray-400">{opt.desc}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input
              id="full_name"
              label="Full Name"
              placeholder="Jane Smith"
              error={errors.full_name?.message}
              {...register('full_name', { required: 'Full name is required' })}
            />
            <Input
              id="email"
              type="email"
              label="Email Address"
              placeholder="jane@company.com"
              error={errors.email?.message}
              {...register('email', { required: 'Email is required' })}
            />
            <Input
              id="phone"
              type="tel"
              label="Phone Number"
              placeholder="+27 71 234 5678"
              error={errors.phone?.message}
              {...register('phone', { required: 'Phone number is required' })}
            />
            {role === 'executive' ? (
              <Input
                id="company_name"
                label="Company Name"
                placeholder="Acme Corporation"
                error={errors.company_name?.message}
                {...register('company_name', { required: 'Company name is required' })}
              />
            ) : (
              <Input
                id="region_code"
                label="Region Code"
                placeholder="e.g. GP — given by your executive"
                error={errors.region_code?.message}
                {...register('region_code', { required: 'Region code is required' })}
              />
            )}
            <Input
              id="address"
              label="Address"
              placeholder="123 Main St, Cape Town"
              error={errors.address?.message}
              {...register('address', { required: 'Address is required' })}
            />
            <PasswordInput
              id="password"
              label="Password"
              placeholder="Minimum 8 characters"
              error={errors.password?.message}
              {...register('password', {
                required:  'Password is required',
                minLength: { value: 8, message: 'Minimum 8 characters' },
              })}
            />
            <PasswordInput
              id="confirm_password"
              label="Confirm Password"
              placeholder="Repeat your password"
              error={errors.confirm_password?.message}
              {...register('confirm_password', {
                required: 'Please confirm your password',
                validate:  val => val === watch('password') || 'Passwords do not match',
              })}
            />

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create Account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-[#C6A35D] hover:underline font-medium">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
