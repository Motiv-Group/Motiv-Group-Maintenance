export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { Mail, Phone, MapPin, User, Star, ExternalLink } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

function StarRow({ score }: { score: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star
          key={i}
          size={14}
          className={i <= score ? 'fill-amber-400 text-amber-400' : 'fill-gray-200 text-gray-300 dark:fill-gray-700 dark:text-gray-600'}
        />
      ))}
    </span>
  )
}

export default async function ContractorProfilePage({ params }: { params: { id: string } }) {
  const supabase   = createClient()
  const adminDb    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: rmProfile }, { data: contractor }, { data: ratings }] = await Promise.all([
    supabase.from('user_profiles').select('role').eq('id', user.id).single(),
    adminDb.from('user_profiles')
      .select('id, full_name, email, phone, address, role')
      .eq('id', params.id)
      .single(),
    adminDb.from('ratings')
      .select('id, score, comment, created_at, ticket_id, tickets(title)')
      .eq('contractor_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (rmProfile?.role !== 'regional_manager') redirect('/auth/login')

  if (!contractor || contractor.role !== 'supplier') notFound()

  const reviews   = (ratings ?? []) as any[]
  const avgRating = reviews.length > 0
    ? reviews.reduce((s: number, r: any) => s + r.score, 0) / reviews.length
    : null

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {contractor.full_name ?? 'Supplier'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Supplier profile</p>
        </div>
      </div>

      {/* Contact details */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Details</p>

        {contractor.full_name && (
          <div className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
            <User size={15} className="text-gray-400 shrink-0" />
            <span>{contractor.full_name}</span>
          </div>
        )}

        {contractor.email ? (
          <a
            href={`mailto:${contractor.email}`}
            className="flex items-center gap-3 text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            <Mail size={15} className="text-gray-400 shrink-0" />
            {contractor.email}
          </a>
        ) : (
          <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-gray-500 italic">
            <Mail size={15} className="shrink-0" />
            No email on record
          </div>
        )}

        {contractor.phone ? (
          <a
            href={`tel:${contractor.phone}`}
            className="flex items-center gap-3 text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            <Phone size={15} className="text-gray-400 shrink-0" />
            {contractor.phone}
          </a>
        ) : (
          <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-gray-500 italic">
            <Phone size={15} className="shrink-0" />
            No phone on record
          </div>
        )}

        {contractor.address ? (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(contractor.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            <MapPin size={15} className="text-gray-400 shrink-0 mt-0.5" />
            {contractor.address}
          </a>
        ) : (
          <div className="flex items-center gap-3 text-sm text-gray-400 dark:text-gray-500 italic">
            <MapPin size={15} className="shrink-0" />
            No address on record
          </div>
        )}
      </div>

      {/* Rating summary */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Rating</p>
          <Link
            href={`/regional/reviews/${params.id}`}
            className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400 hover:underline"
          >
            View all reviews <ExternalLink size={11} />
          </Link>
        </div>

        {avgRating !== null ? (
          <div className="flex items-center gap-3">
            <StarRow score={Math.round(avgRating)} />
            <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{avgRating.toFixed(1)}</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">/ 5 · {reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No reviews yet.</p>
        )}

        {/* Last 3 reviews preview */}
        {reviews.slice(0, 3).map((r: any) => (
          <div key={r.id} className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.tickets?.title ?? 'Unknown ticket'}</p>
              <div className="flex items-center gap-1 shrink-0">
                <StarRow score={r.score} />
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{r.score}/5</span>
              </div>
            </div>
            {r.comment && (
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">{r.comment}</p>
            )}
            <p className="text-xs text-gray-400">{formatDateTime(r.created_at)}</p>
          </div>
        ))}

        {reviews.length > 3 && (
          <Link
            href={`/regional/reviews/${params.id}`}
            className="block text-center text-xs text-brand-600 dark:text-brand-400 hover:underline pt-1"
          >
            + {reviews.length - 3} more review{reviews.length - 3 !== 1 ? 's' : ''}
          </Link>
        )}
      </div>
    </div>
  )
}
