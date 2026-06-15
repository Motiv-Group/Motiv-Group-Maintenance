import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import { Building2, Mail, Phone, MapPin, Star } from 'lucide-react'
import { CompletionReviewCard } from '@/components/regional/CompletionReviewCard'
import { QuoteApprovalCard } from '@/components/regional/QuoteApprovalCard'
import { Badge } from '@/components/ui/Badge'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  QUOTE_STATUS_LABELS, formatDate, formatDateTime, formatCurrency, formatJobId,
} from '@/lib/utils'
import { StaleTicketActions } from '@/components/regional/StaleTicketActions'

export default async function RegionalTicketDetailPage({ params }: { params: { id: string } }) {
  const supabase    = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Profile check, ticket and completions are independent — fetch in parallel
  const [{ data: rmProfile }, { data: ticket }, { data: completionsData }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    adminClient
      .from('tickets')
      .select('*, quotes(*)')
      .eq('id', params.id)
      .single(),
    adminClient
      .from('completions')
      .select('*')
      .eq('ticket_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (rmProfile?.role !== 'regional_manager') redirect('/auth/login')
  if (!ticket) notFound()

  // Verify the ticket belongs to a store in this region
  const { data: store } = await adminClient
    .from('profiles')
    .select('*')
    .eq('id', ticket.client_id)
    .eq('regional_manager_id', user.id)
    .single()

  if (!store) notFound()

  const latestCompletion = (completionsData ?? [])[0] ?? null

  const quotes = (ticket.quotes ?? []).sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
  const hasPendingQuote = quotes.some((q: any) => q.status === 'pending')

  // Flag tickets left Open (no quote) for 7+ days so the RM can decline or act.
  const daysOpen    = Math.floor((Date.now() - new Date(ticket.created_at).getTime()) / 86_400_000)
  const isStaleOpen = ticket.status === 'open' && daysOpen >= 7

  // Fetch contractor profiles and full ratings for quote section
  const adminIds = Array.from(new Set(quotes.map((q: any) => q.admin_id).filter(Boolean))) as string[]
  const [contractorProfilesResult, ratingsResult] = adminIds.length > 0
    ? await Promise.all([
        adminClient.from('profiles').select('id, full_name, email, phone, address').in('id', adminIds),
        adminClient.from('ratings').select('contractor_id, score, comment, created_at').in('contractor_id', adminIds),
      ])
    : [{ data: [] }, { data: [] }]

  const contractorProfiles: Record<string, any> = {}
  for (const p of (contractorProfilesResult.data ?? [])) {
    contractorProfiles[(p as any).id] = p
  }

  const ratingMap: Record<string, { avg: number; count: number; reviews: any[] }> = {}
  for (const adminId of adminIds) {
    const reviews = ((ratingsResult as any).data ?? []).filter((r: any) => r.contractor_id === adminId)
    if (reviews.length > 0) {
      ratingMap[adminId] = {
        avg: reviews.reduce((s: number, r: any) => s + r.score, 0) / reviews.length,
        count: reviews.length,
        reviews,
      }
    }
  }


  return (
    <div className="space-y-5">

      {/* Back */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{ticket.title}</h1>
          <p className="text-sm text-brand-600 dark:text-brand-400">{store.company_name} — {store.sub_store}</p>
          {formatJobId((ticket as any).job_number) && <p className="text-xs font-mono text-gray-400 dark:text-gray-500 mt-0.5">{formatJobId((ticket as any).job_number)}</p>}
        </div>
      </div>

      {/* Status + Priority */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 dark:text-gray-500 self-center">
          {formatDateTime(ticket.created_at)}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Badge className={PRIORITY_COLORS[ticket.priority as keyof typeof PRIORITY_COLORS]}>
            {PRIORITY_LABELS[ticket.priority as keyof typeof PRIORITY_LABELS]}
          </Badge>
          <Badge className={STATUS_COLORS[ticket.status as keyof typeof STATUS_COLORS]}>
            {STATUS_LABELS[ticket.status as keyof typeof STATUS_LABELS]}
          </Badge>
        </div>
      </div>

      {/* Stale (7+ days open) — decline or take action */}
      {isStaleOpen && <StaleTicketActions ticketId={ticket.id} daysOpen={daysOpen} />}

      {/* Description */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</p>
        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{ticket.description}</p>
      </div>

      {/* Photos */}
      {ticket.photo_urls?.length > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Photos ({ticket.photo_urls.length})
          </p>
          <div className="flex flex-wrap gap-3">
            {ticket.photo_urls.map((url: string, i: number) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline font-medium">
                View Photo {i + 1}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Store contact */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Store Contact</p>
        {store.full_name && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Building2 size={14} className="text-gray-400" /> {store.full_name}
          </div>
        )}
        {store.email && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Mail size={14} className="text-gray-400" />
            <a href={`mailto:${store.email}`} className="hover:underline">{store.email}</a>
          </div>
        )}
        {store.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <Phone size={14} className="text-gray-400" />
            <a href={`tel:${store.phone}`} className="hover:underline">{store.phone}</a>
          </div>
        )}
        {store.address && (
          <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <a href={`https://maps.google.com/?q=${encodeURIComponent(store.address)}`}
              target="_blank" rel="noopener noreferrer"
              className="hover:underline text-brand-600 dark:text-brand-400">
              {store.address}
            </a>
          </div>
        )}
      </div>

      {/* Pending quotes — RM approves/declines here */}
      {quotes.filter((q: any) => q.status === 'pending').map((q: any) => (
        <QuoteApprovalCard
          key={q.id}
          quote={q}
          ticketTitle={ticket.title}
          ticketId={ticket.id}
          contractor={contractorProfiles[q.admin_id]}
          rating={ratingMap[q.admin_id]}
        />
      ))}

      {/* COC/POC review — shown when pending_sign_off */}
      {ticket.status === 'pending_sign_off' && latestCompletion && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Sign-off Required
          </h2>
          <CompletionReviewCard completion={latestCompletion} />
        </div>
      )}

      {/* COC/POC history — always shown when completions exist (full audit trail) */}
      {(completionsData ?? []).length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            COC / POC Submission History
          </h2>
          <div className="space-y-3">
            {(completionsData ?? []).filter((comp: any) => comp.status !== 'pending').map((comp: any) => (
              <CompletionReviewCard key={comp.id} completion={comp} />
            ))}
          </div>
        </div>
      )}

      {/* Quote history */}
      {quotes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quote History</p>
          <div className="space-y-3">
            {quotes.filter((q: any) => q.status !== 'pending').map((q: any) => {
              const contractor = contractorProfiles[q.admin_id]
              const rating     = ratingMap[q.admin_id]
              const inner = (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {q.type === 'variation' && (
                        <span className="inline-block mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                          Variation Order
                        </span>
                      )}
                      <p className="text-xl font-bold text-gray-900 dark:text-white">{formatCurrency(q.amount)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(q.created_at)}</p>
                      {contractor && (
                        <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                          <Link
                            href={`/regional/suppliers/${q.admin_id}`}
                            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {contractor.full_name ?? 'Supplier'}
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                          </Link>
                          {rating && (
                            <Link
                              href={`/regional/reviews/${q.admin_id}`}
                              className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              <Star size={11} className="fill-amber-400 text-amber-400" />
                              {rating.avg.toFixed(1)} / 5 ({rating.count})
                            </Link>
                          )}
                        </div>
                      )}

                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                        q.status === 'accepted' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                        q.status === 'declined' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>
                        {QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS]}
                      </span>
                      {q.file_url && (
                        <span className="text-xs text-brand-600 dark:text-brand-400 flex items-center gap-1">
                          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          Open quote
                        </span>
                      )}
                    </div>
                  </div>
                  {q.description && <p className="text-sm text-gray-600 dark:text-gray-300">{q.description}</p>}
                  {q.valid_until && <p className="text-xs text-gray-400">Valid until: {formatDate(q.valid_until)}</p>}
                  {q.decline_reason && <p className="text-xs text-red-500">Reason: {q.decline_reason}</p>}
                </div>
              )
              return q.file_url ? (
                <a key={q.id} href={q.file_url} target="_blank" rel="noopener noreferrer"
                  className="block bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-brand-400 dark:hover:border-gray-400 transition-colors">
                  {inner}
                </a>
              ) : (
                <div key={q.id} className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
