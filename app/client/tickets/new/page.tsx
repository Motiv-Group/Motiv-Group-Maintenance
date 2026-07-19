'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { storeLabel } from '@/lib/utils'
import { LogTicketWizard } from '@/components/tickets/LogTicketWizard'

// Store categories — includes Shopfront + Multiple (a job spanning several trades).
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Shopfront', 'Cleaning', 'General', 'Multiple', 'Other']

export default function LogTicketPage() {
  const [storeName, setStoreName] = useState<string | null>(null)

  // Store is auto-detected from the SM's link (they don't pick one) — fetch its
  // name purely to confirm it read-only on the Review step.
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: link } = await supabase.from('store_users').select('store_id').eq('user_id', user.id).limit(1).maybeSingle()
        if (!link?.store_id) return
        const { data: s } = await supabase.from('stores').select('name, sub_store').eq('id', link.store_id).maybeSingle()
        if (alive && s) setStoreName(storeLabel(s.name, s.sub_store))
      } catch { /* best-effort; Review falls back to a generic label */ }
    })()
    return () => { alive = false }
  }, [])

  return (
    <LogTicketWizard
      categories={CATEGORIES}
      title="Log a Ticket"
      subtitle="A few quick steps and we’ll take it from there."
      backHref="/client/tickets"
      backLabel="Back to tickets"
      redirectHref="/client/tickets"
      submitLabel="Submit Ticket"
      contextRow={{ label: 'Store', value: storeName ?? 'Your assigned store' }}
      urgencyHint="Pick the impact on trading — this sets the priority."
      descriptionPlaceholder="e.g. The walk-in freezer in the back stopped cooling since this morning…"
    />
  )
}
