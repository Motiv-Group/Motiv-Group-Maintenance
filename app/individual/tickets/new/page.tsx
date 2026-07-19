'use client'

import { LogTicketWizard } from '@/components/tickets/LogTicketWizard'

// Home-owner categories (no shopfront/trading concepts; includes Appliances/Painting).
const CATEGORIES = ['Electrical', 'Plumbing', 'HVAC', 'Refrigeration', 'Gas', 'Structural', 'Appliances', 'Painting', 'General', 'Cleaning', 'Other']

export default function LogJobPage() {
  return (
    <LogTicketWizard
      categories={CATEGORIES}
      title="Log a Job"
      subtitle="A few quick steps and we’ll sort your home maintenance."
      backHref="/individual/tickets"
      backLabel="Back to jobs"
      redirectHref="/individual/tickets"
      submitLabel="Submit Job"
      urgencyHint="Pick how much it affects your home — this sets the priority."
      descriptionPlaceholder="e.g. The geyser in the main bathroom has been leaking since last night…"
    />
  )
}
