export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import {
  Mail, Phone, MapPin, Building2,
  ChevronDown, ChevronUp, User, Hash,
} from 'lucide-react'

export default async function RMDetailPage({ params }: { params: { id: string } }) {
  const adminClient = createAdminClient()

  const [{ data: rm }, { data: branches }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('*')
      .eq('id', params.id)
      .eq('role', 'regional_manager')
      .single(),
    adminClient
      .from('profiles')
      .select('id, full_name, company_name, sub_store, email, phone, address, branch_code')
      .eq('regional_manager_id', params.id)
      .in('role', ['store_manager', 'client'])
      .order('company_name'),
  ])

  if (!rm) notFound()

  const branchList = branches ?? []

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{rm.full_name ?? 'Unnamed'}</h1>
          {rm.company_name && (
            <p className="text-sm text-brand-600 dark:text-brand-400">{rm.company_name}</p>
          )}
        </div>
      </div>

      {/* Contact details card */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 border-l-brand-500 rounded-xl p-5 space-y-3">
        <h2 className="font-semibold text-sm text-gray-900 dark:text-white mb-4">Contact Details</h2>
        {[
          { icon: Mail,   label: 'Email',   value: rm.email,   href: rm.email   ? `mailto:${rm.email}` : null },
          { icon: Phone,  label: 'Phone',   value: rm.phone,   href: rm.phone   ? `tel:${rm.phone}`    : null },
          { icon: MapPin, label: 'Address', value: rm.address, href: rm.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(rm.address)}` : null },
        ].map(({ icon: Icon, label, value, href }) => (
          <div key={label} className="flex items-center gap-3">
            <Icon size={15} className="text-gray-400 shrink-0" />
            {value ? (
              href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-gray-700 dark:text-gray-200 hover:underline truncate">{value}</a>
              ) : (
                <span className="text-sm text-gray-700 dark:text-gray-200 truncate">{value}</span>
              )
            ) : (
              <span className="text-sm text-gray-400 italic">Not set</span>
            )}
          </div>
        ))}
        <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
          <p className="text-xs text-gray-400">
            {branchList.length} branch{branchList.length !== 1 ? 'es' : ''} under management
          </p>
        </div>
      </div>

      {/* Branches */}
      <div>
        <h2 className="font-semibold text-gray-900 dark:text-white mb-3">
          Branches ({branchList.length})
        </h2>

        {branchList.length === 0 ? (
          <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-10 text-center">
            <Building2 size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No branches linked yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {branchList.map((branch: any) => (
              <details key={branch.id} className="group bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                  <Building2 size={16} className="text-brand-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{branch.company_name ?? '—'}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{branch.sub_store ?? '—'}</p>
                  </div>
                  {branch.branch_code && (
                    <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded shrink-0">
                      {branch.branch_code}
                    </span>
                  )}
                  <ChevronDown size={15} className="text-gray-400 shrink-0 group-open:hidden" />
                  <ChevronUp   size={15} className="text-gray-400 shrink-0 hidden group-open:block" />
                </summary>

                {/* Branch contact details */}
                <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-4 space-y-2.5 bg-gray-50/50 dark:bg-gray-700/20">
                  {[
                    { icon: User,   label: 'Manager',      value: branch.full_name,   href: null },
                    { icon: Mail,   label: 'Email',        value: branch.email,       href: branch.email  ? `mailto:${branch.email}`  : null },
                    { icon: Phone,  label: 'Phone',        value: branch.phone,       href: branch.phone  ? `tel:${branch.phone}`      : null },
                    { icon: MapPin, label: 'Address',      value: branch.address,     href: branch.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address)}` : null },
                    { icon: Hash,   label: 'Branch Code',  value: branch.branch_code, href: null },
                  ].map(({ icon: Icon, label, value, href }) =>
                    value ? (
                      <div key={label} className="flex items-start gap-3">
                        <Icon size={14} className="text-gray-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400">{label}</p>
                          {href ? (
                            <a href={href} className="text-sm text-gray-700 dark:text-gray-200 hover:underline truncate block">{value}</a>
                          ) : (
                            <p className="text-sm text-gray-700 dark:text-gray-200 truncate">{value}</p>
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
