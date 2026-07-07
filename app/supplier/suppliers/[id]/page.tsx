export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import Link from 'next/link'
import {
  Mail, Phone, MapPin, Building2, Pencil,
  CheckCircle2, XCircle, Hash, FileText, CalendarClock,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { SupplierDeleteButton } from '@/components/admin/SupplierDeleteButton'
import type { Supplier } from '@/lib/types'

const TRADE_COLORS: Record<string, string> = {
  Electrical: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Plumbing:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  HVAC:       'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  Painting:   'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  Carpentry:  'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  Tiling:     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  Roofing:    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  General:    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

export default async function SupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const adminClient = createAdminClient()

  const { data } = await adminClient
    .from('suppliers')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!data) notFound()
  const supplier = data as Supplier

  const tradeClass = supplier.trade
    ? (TRADE_COLORS[supplier.trade] ?? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400')
    : null

  const isExpiringSoon = supplier.qualification_expiry
    ? new Date(supplier.qualification_expiry) <= new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
    : false

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{supplier.company_name}</h1>
          {supplier.trade && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tradeClass}`}>
              {supplier.trade}
            </span>
          )}
        </div>
        <Link href={`/supplier/suppliers/${supplier.id}/edit`}
          className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-2 rounded-xl transition-colors">
          <Pencil size={13} /> Edit
        </Link>
      </div>

      {/* Qualified status banner */}
      {supplier.qualified ? (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-700 dark:text-green-400">Qualified Sub Supplier</p>
            {supplier.qualification_number && (
              <p className="text-xs text-green-600 dark:text-green-500">Reg: {supplier.qualification_number}</p>
            )}
          </div>
          {supplier.qualification_expiry && (
            <div className={`ml-auto text-right text-xs ${isExpiringSoon ? 'text-orange-600 dark:text-orange-400 font-semibold' : 'text-green-600 dark:text-green-500'}`}>
              <p className="font-medium">Expires</p>
              <p>{formatDate(supplier.qualification_expiry)}</p>
              {isExpiringSoon && <p className="text-orange-500 font-bold">⚠ Expiring soon</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3">
          <XCircle size={16} className="text-gray-400 shrink-0" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Not qualified / certification not on record</p>
        </div>
      )}

      {/* Contact details */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Details</p>

        {supplier.contact_name && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Building2 size={14} className="text-gray-400 shrink-0" />
            <span>{supplier.contact_name}</span>
          </div>
        )}
        {supplier.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Mail size={14} className="text-gray-400 shrink-0" />
            <a href={`mailto:${supplier.email}`} className="hover:underline text-brand-600 dark:text-brand-400">{supplier.email}</a>
          </div>
        )}
        {supplier.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Phone size={14} className="text-gray-400 shrink-0" />
            <a href={`tel:${supplier.phone}`} className="hover:underline">{supplier.phone}</a>
          </div>
        )}
        {supplier.address && (
          <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
            <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(supplier.address)}`}
              target="_blank" rel="noopener noreferrer"
              className="hover:underline text-brand-600 dark:text-brand-400"
            >
              {supplier.address}
            </a>
          </div>
        )}
        {!supplier.contact_name && !supplier.email && !supplier.phone && !supplier.address && (
          <p className="text-sm text-gray-400 italic">No contact details on record.</p>
        )}
      </div>

      {/* Company / financial */}
      {(supplier.vat_number) && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Company Details</p>
          {supplier.vat_number && (
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Hash size={14} className="text-gray-400 shrink-0" />
              <span>VAT: <span className="font-mono font-semibold">{supplier.vat_number}</span></span>
            </div>
          )}
        </div>
      )}

      {/* Qualification details */}
      {supplier.qualified && (supplier.qualification_number || supplier.qualification_expiry) && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Qualification Details</p>
          {supplier.qualification_number && (
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <FileText size={14} className="text-gray-400 shrink-0" />
              <span>Registration: <span className="font-mono font-semibold">{supplier.qualification_number}</span></span>
            </div>
          )}
          {supplier.qualification_expiry && (
            <div className={`flex items-center gap-2 text-sm ${isExpiringSoon ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-200'}`}>
              <CalendarClock size={14} className="shrink-0" />
              <span>Expires: <span className="font-semibold">{formatDate(supplier.qualification_expiry)}</span>
                {isExpiringSoon && <span className="ml-2 text-xs font-bold text-orange-500">⚠ Within 60 days</span>}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {supplier.notes && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Notes</p>
          <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{supplier.notes}</p>
        </div>
      )}

      {/* Meta */}
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
        Added {formatDate(supplier.created_at)}
        {supplier.updated_at !== supplier.created_at && ` · Updated ${formatDate(supplier.updated_at)}`}
      </p>

      {/* Delete */}
      <SupplierDeleteButton supplierId={supplier.id} />
    </div>
  )
}
