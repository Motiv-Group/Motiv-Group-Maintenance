'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/exec/ui'
import { UserCircle2 } from 'lucide-react'
import { SettingsHeader } from '@/components/settings/SettingsHeader'
import { VerificationCard } from '@/components/supplier/VerificationCard'

const ROLE_LABELS: Record<string, string> = {
  supplier:         'Supplier',
  regional_manager: 'Regional Manager',
  store_manager:    'Store Manager',
  client:           'Store Manager',
  executive:        'Executive',
  system_admin:     'System Admin',
  individual:       'Individual',
}

export default function AccountSettingsPage() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/profile')
      .then(r => r.json())
      .then(({ profile }) => {
        if (profile) { setEmail(profile.email ?? ''); setRole(profile.role ?? ''); setCompanyId(profile.company_id ?? null) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Standalone suppliers manage their verification documents + status here.
  const showVerification = role === 'supplier' && !companyId

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <SettingsHeader title="Account" subtitle="Your login details and role." Icon={UserCircle2} />
      <Card className="p-5">
        {loading ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-brand-600" /></div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-[var(--text-faint)] mb-1">Email</p>
              <p className="text-sm text-[var(--text)]">{email || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-faint)] mb-1">Role</p>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                {ROLE_LABELS[role] ?? role ?? '—'}
              </span>
            </div>
          </div>
        )}
      </Card>

      {showVerification && (
        <div className="space-y-2">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]">Supplier verification</p>
          <VerificationCard />
        </div>
      )}
    </div>
  )
}
