'use client'

import { Bell } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { PushNotificationToggle } from '@/components/ui/PushNotificationToggle'
import { SettingsHeader } from '@/components/settings/SettingsHeader'

export default function NotificationsSettingsPage() {
  return (
    <div className="max-w-2xl space-y-5">
      <SettingsHeader title="Notifications" subtitle="Choose how Motiv keeps you posted." Icon={Bell} />
      <Card className="p-5">
        <PushNotificationToggle />
      </Card>
    </div>
  )
}
