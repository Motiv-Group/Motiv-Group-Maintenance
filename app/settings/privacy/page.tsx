'use client'

import { ShieldCheck } from 'lucide-react'
import { DataPrivacySection } from '@/components/settings/DataPrivacySection'
import { SettingsHeader } from '@/components/settings/SettingsHeader'

export default function PrivacySettingsPage() {
  return (
    <div className="max-w-2xl space-y-5">
      <SettingsHeader title="Privacy & Data" subtitle="Export your data or close your account." Icon={ShieldCheck} />
      <DataPrivacySection />
    </div>
  )
}
