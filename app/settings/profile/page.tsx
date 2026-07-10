'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { isValidPhone } from '@/lib/csv'
import { Building2, CheckCircle2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { SettingsHeader } from '@/components/settings/SettingsHeader'

interface ProfileForm {
  full_name: string
  phone: string
  address: string
  company_name: string
  sub_store: string
  branch_code: string
  requested_region_code: string
}

export default function ProfileSettingsPage() {
  const [loading,  setLoading]  = useState(false)
  const [fetching, setFetching] = useState(true)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')
  const [role,     setRole]     = useState('')

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ProfileForm>()

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(({ profile }) => {
        if (profile) {
          reset({
            full_name:    profile.full_name    ?? '',
            phone:        profile.phone        ?? '',
            address:      profile.address      ?? '',
            company_name: profile.company_name ?? '',
            sub_store:    profile.sub_store    ?? '',
            branch_code:  profile.branch_code  ?? '',
            requested_region_code: profile.requested_region_code ?? '',
          })
          setRole(profile.role ?? '')
        }
        setFetching(false)
      })
      .catch(() => setFetching(false))
  }, [reset])

  async function onSubmit(values: ProfileForm) {
    setLoading(true); setError(''); setSaved(false)
    const res = await fetch('/api/profile', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values),
    })
    if (!res.ok) { const d = await res.json(); setError(d.error || 'Failed to save'); setLoading(false); return }
    setSaved(true); setLoading(false); setTimeout(() => setSaved(false), 3000)
  }

  const isStoreManager = role === 'store_manager' || role === 'client'
  const isRegionalManager = role === 'regional_manager'
  const title = isStoreManager ? 'Store Information' : 'Profile Information'
  // Store managers may only edit their own name; the rest is managed for them.
  const lock = isStoreManager
  const lockCls = 'disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-800'

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <SettingsHeader title={title} subtitle="Update your contact and company details." Icon={Building2} />
      <Card className="p-5">
        {fetching ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-600" /></div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input id="full_name" label={isStoreManager ? 'Store manager full name' : 'Full Name'} placeholder="Jane Smith" error={errors.full_name?.message}
              {...register('full_name', { required: 'Full name is required' })} />
            <Input id="company_name" label="Company Name" placeholder="Acme Corporation" error={errors.company_name?.message}
              disabled={lock} className={lockCls} {...register('company_name')} />

            {isRegionalManager && (
              <Input id="requested_region_code" label="Region Code" placeholder="e.g. GP — given by your executive"
                error={errors.requested_region_code?.message} {...register('requested_region_code')} />
            )}

            {isStoreManager && (
              <>
                <Input id="sub_store" label="Branch / Sub-Store" placeholder="e.g. Cape Town Branch"
                  disabled={lock} className={lockCls} error={errors.sub_store?.message} {...register('sub_store')} />
                <Input id="branch_code" label="Branch Code" placeholder="e.g. CPT001"
                  disabled={lock} className={lockCls} error={errors.branch_code?.message} {...register('branch_code')} />
              </>
            )}

            <Input id="phone" type="tel" label="Phone Number" placeholder="+27 71 234 5678"
              disabled={lock} className={lockCls} error={errors.phone?.message} {...register('phone', { validate: v => !v || isValidPhone(v) || 'Enter a valid phone number' })} />
            <Input id="address" label="Address" placeholder="123 Main St, Cape Town" disabled={lock} className={lockCls} {...register('address')} />

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>
            )}
            {saved && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3">
                <CheckCircle2 size={16} /> Changes saved successfully.
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">Save Changes</Button>
          </form>
        )}
      </Card>
    </div>
  )
}
