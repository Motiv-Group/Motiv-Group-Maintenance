'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { isValidPhone } from '@/lib/csv'
import { useTheme } from '@/components/providers/ThemeProvider'
import { UserCircle2, Building2, CheckCircle2, Sun, Moon } from 'lucide-react'
import { BackButton } from '@/components/ui/BackButton'
import { PushNotificationToggle } from '@/components/ui/PushNotificationToggle'
import { DataPrivacySection } from '@/components/settings/DataPrivacySection'

interface ProfileForm {
  full_name: string
  phone: string
  address: string
  company_name: string
  sub_store: string
  branch_code: string
  requested_region_code: string
}

const ROLE_LABELS: Record<string, string> = {
  supplier:         'Supplier',
  regional_manager: 'Regional Manager',
  store_manager:    'Store Manager',
  client:           'Store Manager',
}

export default function SettingsPage() {
  const { theme, toggle } = useTheme()
  const [loading,  setLoading]  = useState(false)
  const [fetching, setFetching] = useState(true)
  const [saved,    setSaved]    = useState(false)
  const [error,    setError]    = useState('')
  const [email,    setEmail]    = useState('')
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
          setEmail(profile.email ?? '')
          setRole(profile.role   ?? '')
        }
        setFetching(false)
      })
  }, [reset])

  async function onSubmit(values: ProfileForm) {
    setLoading(true)
    setError('')
    setSaved(false)

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })

    if (!res.ok) {
      const d = await res.json()
      setError(d.error || 'Failed to save')
      setLoading(false)
      return
    }

    setSaved(true)
    setLoading(false)
    setTimeout(() => setSaved(false), 3000)
  }

  if (fetching) {
    return (
      <div className="max-w-lg mx-auto py-10 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    )
  }

  const isStoreManager = role === 'store_manager' || role === 'client'
  const isRegionalManager = role === 'regional_manager'
  const sectionLabel   = isStoreManager ? 'Store Information' : 'Profile Information'

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your account information.</p>
        </div>
      </div>

      {/* Account info (read-only) */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle2 size={16} className="text-[#C6A35D]" />
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Account</h2>
        </div>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Email</p>
            <p className="text-sm text-gray-700 dark:text-gray-200">{email}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Role</p>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
              {ROLE_LABELS[role] ?? role}
            </span>
          </div>
        </div>
      </div>

      {/* Editable profile */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={16} className="text-[#C6A35D]" />
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm">{sectionLabel}</h2>
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
            id="company_name"
            label="Company Name"
            placeholder="Acme Corporation"
            error={errors.company_name?.message}
            {...register('company_name')}
          />

          {/* Regional-manager region code (used by the executive to link them) */}
          {isRegionalManager && (
            <Input
              id="requested_region_code"
              label="Region Code"
              placeholder="e.g. GP — given by your executive"
              error={errors.requested_region_code?.message}
              {...register('requested_region_code')}
            />
          )}

          {/* Store-manager-only fields */}
          {isStoreManager && (
            <>
              <Input
                id="sub_store"
                label="Branch / Sub-Store"
                placeholder="e.g. Cape Town Branch"
                error={errors.sub_store?.message}
                {...register('sub_store')}
              />
              <div>
                <Input
                  id="branch_code"
                  label="Branch Code"
                  placeholder="e.g. CPT001"
                  error={errors.branch_code?.message}
                  {...register('branch_code')}
                />
              </div>
            </>
          )}

          <Input
            id="phone"
            type="tel"
            label="Phone Number"
            placeholder="+27 71 234 5678"
            error={errors.phone?.message}
            {...register('phone', { validate: v => !v || isValidPhone(v) || 'Enter a valid phone number' })}
          />
          <Input
            id="address"
            label="Address"
            placeholder="123 Main St, Cape Town"
            {...register('address')}
          />

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          {saved && (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm rounded-lg px-4 py-3">
              <CheckCircle2 size={16} /> Changes saved successfully.
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full">
            Save Changes
          </Button>
        </form>
      </div>

      {/* Notifications */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Notifications</h2>
        <PushNotificationToggle />
      </div>

      {/* Appearance */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4">Appearance</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-200">Theme</p>
            <p className="text-xs text-gray-400 mt-0.5">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
          </div>
          <button
            onClick={toggle}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {theme === 'dark' ? <Sun size={16} className="text-[#C6A35D]" /> : <Moon size={16} className="text-[#C6A35D]" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>

      {/* Privacy & data (POPIA) */}
      <DataPrivacySection />

    </div>
  )
}
