'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Button } from '@/components/ui/Button'
import { MotivLogo } from '@/components/ui/MotivLogo'
import { Truck } from 'lucide-react'

interface OnboardForm {
  company_name: string
  contact_name: string
  phone:        string
  address:      string
  vat_number:   string
  trade:        string
  password:     string
  confirm_password: string
}

export default function SupplierOnboardPage() {
  const router = useRouter()
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<OnboardForm>()
  const [token, setToken]     = useState<string | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail]     = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  // Validate the custom invite token (from ?token=) on load.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    setToken(t)
    if (!t) { setInvalid('No invite token in the link.'); setChecking(false); return }
    fetch(`/api/supplier/onboard?token=${encodeURIComponent(t)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setInvalid(d.error || 'This invite link is invalid.'); return }
        setEmail(d.email)
        reset({ company_name: d.companyName ?? '', trade: d.trade ?? '', contact_name: '', phone: '', address: '', vat_number: '', password: '', confirm_password: '' })
      })
      .finally(() => setChecking(false))
  }, [reset])

  async function onSubmit(values: OnboardForm) {
    if (!token) return
    setLoading(true)
    setError('')

    const res = await fetch('/api/supplier/onboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...values }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Could not create your account.'); setLoading(false); return }

    // Sign them straight in with the password they just chose.
    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: d.email, password: values.password })
    if (signInErr) { router.push('/auth/login'); return } // account exists — let them log in
    router.push('/supplier')
    router.refresh()
  }

  if (checking) {
    return (
      <div className="dark min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C6A35D]" />
      </div>
    )
  }

  if (invalid) {
    return (
      <div className="dark min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center mb-8"><MotivLogo height={80} /></div>
          <div className="bg-gray-900 rounded-2xl border border-gray-700 p-8 space-y-3">
            <h1 className="text-xl font-semibold text-white">Invite link problem</h1>
            <p className="text-sm text-gray-400">{invalid}</p>
            <Link href="/auth/login" className="text-[#C6A35D] hover:underline text-sm">Go to login</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dark">
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-center mb-8"><MotivLogo height={72} /></div>
          <div className="bg-gray-900 rounded-2xl shadow-xl border border-gray-700 p-6 sm:p-8">
            <div className="flex items-center gap-2 mb-1">
              <Truck size={18} className="text-[#C6A35D]" />
              <h1 className="text-xl font-semibold text-white">Set up your supplier account</h1>
            </div>
            <p className="text-sm text-gray-400 mb-5">Complete your company details and choose a password.</p>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input value={email ?? ''} readOnly className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm cursor-not-allowed" />
              </div>
              <Input id="company_name" label="Company Name" placeholder="Colorworx" error={errors.company_name?.message} {...register('company_name', { required: 'Company name is required' })} />
              <Input id="contact_name" label="Your Name" placeholder="Jacques Dippenaar" error={errors.contact_name?.message} {...register('contact_name', { required: 'Your name is required' })} />
              <Input id="phone" type="tel" label="Phone Number" placeholder="+27 71 234 5678" error={errors.phone?.message} {...register('phone', { required: 'Phone number is required' })} />
              <Input id="address" label="Address" placeholder="123 Main St, Cape Town" error={errors.address?.message} {...register('address')} />
              <Input id="trade" label="Trade" placeholder="e.g. Shopfitting" error={errors.trade?.message} {...register('trade')} />
              <Input id="vat_number" label="Tax / VAT Number" placeholder="4123456789" error={errors.vat_number?.message} {...register('vat_number')} />
              <PasswordInput id="password" label="Password" placeholder="Minimum 8 characters" error={errors.password?.message} {...register('password', { required: 'Password is required', minLength: { value: 8, message: 'Minimum 8 characters' } })} />
              <PasswordInput id="confirm_password" label="Confirm Password" placeholder="Repeat your password" error={errors.confirm_password?.message} {...register('confirm_password', { required: 'Please confirm your password', validate: v => v === watch('password') || 'Passwords do not match' })} />

              {error && <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>}

              <Button type="submit" loading={loading} className="w-full bg-[#C6A35D] hover:bg-[#b8954f] text-white border-[#C6A35D] focus:ring-[#C6A35D]" size="lg">
                Create account
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
