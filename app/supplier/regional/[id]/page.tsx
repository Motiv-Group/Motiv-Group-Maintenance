export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { SectionCard } from '@/components/exec/ui'
import {
  Mail, Phone, MapPin, Building2,
  ChevronDown, User, Hash,
} from 'lucide-react'

export default async function RMDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminClient = createAdminClient()

  // v3: the RM is a user_profiles row; their branches are the stores in the
  // region(s) they manage (regional_users → stores).
  const { data: rm } = await adminClient
    .from('user_profiles')
    .select('id, full_name, company_name, email, phone, address')
    .eq('id', params.id)
    .eq('role', 'regional_manager')
    .single()

  if (!rm) notFound()

  const { data: rmRegions } = await adminClient
    .from('regional_users').select('region_id').eq('user_id', params.id)
  const regionIds = (rmRegions ?? []).map(r => r.region_id)

  const { data: branches } = regionIds.length
    ? await adminClient
        .from('stores')
        .select('id, name, sub_store, address, branch_code')
        .in('region_id', regionIds)
        .order('name')
    : { data: [] as any[] }

  // Map stores.`name` → company_name so the branch JSX below reads cleanly. Store-
  // manager contact fields (full_name/email/phone) are not on `stores`; the JSX
  // guards each with `value ? … : null`, so absent fields simply don't render.
  const branchList = ((branches ?? []) as any[]).map(b => ({ ...b, company_name: b.name }))

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-[var(--text)]">{rm.full_name ?? 'Unnamed'}</h1>
          {rm.company_name && (
            <p className="text-sm text-[var(--text-muted)]">{rm.company_name}</p>
          )}
        </div>
      </div>

      {/* Contact details card */}
      <SectionCard title="Contact Details">
        <div className="space-y-3">
          {[
            { icon: Mail,   label: 'Email',   value: rm.email,   href: rm.email   ? `mailto:${rm.email}` : null },
            { icon: Phone,  label: 'Phone',   value: rm.phone,   href: rm.phone   ? `tel:${rm.phone}`    : null },
            { icon: MapPin, label: 'Address', value: rm.address, href: rm.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rm.address)}` : null },
          ].map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex items-center gap-3">
              <Icon size={15} className="text-[var(--text-faint)] shrink-0" />
              {value ? (
                href ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--text)] hover:underline truncate">{value}</a>
                ) : (
                  <span className="text-sm text-[var(--text)] truncate">{value}</span>
                )
              ) : (
                <span className="text-sm text-[var(--text-faint)] italic">Not set</span>
              )}
            </div>
          ))}
          <div className="pt-3 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--text-faint)]">
              {branchList.length} branch{branchList.length !== 1 ? 'es' : ''} under management
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Branches */}
      <div>
        <h2 className="font-semibold text-[var(--text)] mb-3">
          Branches ({branchList.length})
        </h2>

        {branchList.length === 0 ? (
          <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-[var(--border)] px-4 py-10 text-center">
            <div>
              <Building2 size={28} className="mx-auto text-[var(--text-faint)] mb-2" />
              <p className="text-sm text-[var(--text-faint)]">No branches linked yet.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {branchList.map((branch: any) => (
              <details key={branch.id} className="group rounded-xl bg-[var(--surface)] ring-1 ring-[var(--border)] overflow-hidden">
                <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-[var(--hover)] transition-colors">
                  <Building2 size={16} className="text-blue-600 dark:text-blue-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text)] truncate">{branch.company_name ?? '—'}</p>
                    <p className="text-xs text-[var(--text-muted)] truncate">{branch.sub_store ?? '—'}</p>
                  </div>
                  {branch.branch_code && (
                    <span className="font-mono text-xs bg-[var(--hover)] text-[var(--text-muted)] px-2 py-0.5 rounded shrink-0">
                      {branch.branch_code}
                    </span>
                  )}
                  <ChevronDown size={15} className="text-[var(--text-faint)] shrink-0 transition-transform group-open:rotate-180" />
                </summary>

                {/* Branch contact details */}
                <div className="border-t border-[var(--border)] px-4 py-4 space-y-2.5">
                  {[
                    { icon: User,   label: 'Manager',      value: branch.full_name,   href: null },
                    { icon: Mail,   label: 'Email',        value: branch.email,       href: branch.email  ? `mailto:${branch.email}`  : null },
                    { icon: Phone,  label: 'Phone',        value: branch.phone,       href: branch.phone  ? `tel:${branch.phone}`      : null },
                    { icon: MapPin, label: 'Address',      value: branch.address,     href: branch.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}` : null },
                    { icon: Hash,   label: 'Branch Code',  value: branch.branch_code, href: null },
                  ].map(({ icon: Icon, label, value, href }) =>
                    value ? (
                      <div key={label} className="flex items-start gap-3">
                        <Icon size={14} className="text-[var(--text-faint)] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs text-[var(--text-faint)]">{label}</p>
                          {href ? (
                            <a href={href} className="text-sm text-[var(--text)] hover:underline truncate block">{value}</a>
                          ) : (
                            <p className="text-sm text-[var(--text)] truncate">{value}</p>
                          )}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
