'use client'

import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'

// Pick which company's projects to view/manage. Companies are created in the
// Accounts tab — this only selects. Defaults to the admin's linked company.
export function ProjectCompanySelector({ companies, selectedId }: { companies: { id: string; name: string }[]; selectedId: string | null }) {
  const router = useRouter()
  return (
    <Card className="p-3 flex flex-wrap items-center gap-2">
      <Building2 size={16} className="text-blue-500 shrink-0" />
      <span className="text-sm font-semibold text-[var(--text)]">Company</span>
      <select
        value={selectedId ?? ''}
        onChange={e => router.push(`/admin/projects?company=${e.target.value}`)}
        className="min-w-0 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        {!selectedId && <option value="">Select a company…</option>}
        {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <span className="text-xs text-[var(--text-faint)]">Projects for the selected company. Companies are created in Accounts.</span>
    </Card>
  )
}
