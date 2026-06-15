'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { Store, Users } from 'lucide-react'
import { MotivLogo } from '@/components/ui/MotivLogo'

type Role = 'store_manager' | 'regional_manager'

interface SignupForm {
  full_name:    string
  email:        string
  phone:        string
  address:      string
  company_name: string
  sub_store:    string
  branch_code:  string
  password:     string
  confirm_password: string
}

export default function SignupPage() {
  const router  = useRouter()
  const [role,    setRole]    = useState<Role>('store_manager')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<SignupForm>()

  function switchRole(r: Role) {
    setRole(r)
    setError('')
  }

  async function onSubmit(values: SignupForm) {
    setLoading(true)
    setError('')

    const supabase    = createClient()
    const branchCode  = values.branch_code?.trim().toUpperCase() ?? ''
    const isStoreMgr  = role === 'store_manager'

    const { data, error: authError } = await supabase.auth.signUp({
      email:    values.email,
      password: values.password,
      options: {
        data: {
          full_name:    values.full_name,
          phone:        values.phone,
          address:      values.address,
          company_name: values.company_name,
          sub_store:    isStoreMgr ? values.sub_store  : null,
          branch_code:  isStoreMgr ? branchCode        : null,
          role,
        },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (data.session && data.user) {
      const res = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:    values.full_name,
          phone:        values.phone,
          address:      values.address,
          company_name: values.company_name,
          sub_store:    isStoreMgr ? values.sub_store : null,
          branch_code:  isStoreMgr ? branchCode       : null,
          role,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        if (d.error?.includes('unique') || d.error?.includes('branch_code')) {
          setError('That branch code is already in use. Please choose a different one.')
          setLoading(false)
          return
        }
      }
    }

    router.push(role === 'regional_manager' ? '/regional' : '/client')
  }

  const isStoreMgr = role === 'store_manager'

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
              { value: 'store_manager',    label: 'Store Manager',    icon: Store, desc: 'Submit & track tickets' },
              { value: 'regional_manager', label: 'Regional Manager', icon: Users, desc: 'Oversee multiple stores' },
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
                <opt.icon
                  size={20}
                  className="text-[#C6A35D]"
                />
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
            <Input
              id="company_name"
              label="Company Name"
              placeholder="Acme Corporation"
              error={errors.company_name?.message}
              {...register('company_name', { required: 'Company name is required' })}
            />

            {isStoreMgr && (
              <>
                <Input
                  id="sub_store"
                  label="Branch / Sub-Store"
                  placeholder="e.g. Cape Town Branch"
                  error={errors.sub_store?.message}
                  {...register('sub_store', { required: isStoreMgr ? 'Branch name is required' : false })}
                />
                <div>
                  <Input
                    id="branch_code"
                    label="Branch Code"
                    placeholder="e.g. CPT001"
                    error={errors.branch_code?.message}
                    {...register('branch_code', {
                      required: isStoreMgr ? 'Branch code is required' : false,
                      pattern:  { value: /^[A-Za-z0-9]+$/, message: 'Letters and numbers only' },
                    })}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Unique identifier — your regional manager uses this to link your store.
                  </p>
                </div>
              </>
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
