export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Network, ChevronRight } from 'lucide-react'
import { requireMasterAdmin } from '@/lib/health/guard'
import { createAdminClient } from '@/lib/supabase/server'
import { InfoTip } from '@/components/ui/InfoTip'
import { Card } from '@/components/exec/ui'
import { CompanyAvatar } from '@/components/admin/CompanyAvatar'

export default async function AdminHierarchyPage() {
  await requireMasterAdmin()
  const db = createAdminClient()
  const [{ data: companies }, { data: regions }, { data: stores }, { data: users }] = await Promise.all([
    db.from('companies').select('id, name, logo_url').eq('active', true).order('name'),
    db.from('regions').select('id, company_id').eq('active', true),
    db.from('stores').select('id, company_id').eq('active', true),
    db.from('user_profiles').select('id, role, company_id').in('role', ['executive', 'regional_manager', 'store_manager']).eq('active', true),
  ])

  const count = (arr: { company_id: string | null }[] | null, cid: string) => (arr ?? []).filter(x => x.company_id === cid).length
  const managers = (cid: string) => (users ?? []).filter(u => u.company_id === cid).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2">
          <Network className="text-blue-600 dark:text-blue-400" size={22} /> Hierarchy
          <InfoTip title="Hierarchy" align="left">Open a company to link its managers: assign each Regional Manager their regions and executive(s), and each Store Manager their stores.</InfoTip>
        </h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Pick a company to manage who is linked to what.</p>
      </div>

      <div className="space-y-2.5">
        {(companies ?? []).map(c => (
          <Link key={c.id} href={`/admin/hierarchy/${c.id}`} className="block">
            <Card className="p-4 flex items-center gap-3 transition hover:bg-[var(--hover)]">
              <CompanyAvatar name={c.name} logoUrl={c.logo_url ?? null} size={44} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--text)] truncate">{c.name}</p>
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{count(regions, c.id)} regions · {count(stores, c.id)} stores · {managers(c.id)} managers</p>
              </div>
              <ChevronRight size={18} className="shrink-0 text-[var(--text-faint)]" />
            </Card>
          </Link>
        ))}
        {!(companies ?? []).length && (
          <Card className="p-8 text-center"><p className="text-sm text-[var(--text-muted)]">No companies yet.</p></Card>
        )}
      </div>
    </div>
  )
}
