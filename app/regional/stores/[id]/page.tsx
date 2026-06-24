export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { BackButton } from '@/components/ui/BackButton'
import {
  Phone, Mail, MapPin, Building2,
  FileText, Clock, Archive, AlertCircle, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { QuoteApprovalCard } from '@/components/regional/QuoteApprovalCard'
import { RecentTicketsStack } from '@/components/regional/RecentTicketsStack'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, formatDateTime, formatCurrency, formatJobId,
} from '@/lib/utils'
import type { Ticket, Quote } from '@/lib/types'

function TicketRow({ ticket, storeName }: { ticket: Ticket; storeName?: string }) {
  const latestQuote = ((ticket as any).quotes ?? [])
    .filter((q: any) => q.status !== 'declined')
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]

  return (
    <Link href={`/regional/tickets/${ticket.id}`}>
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:border-brand-400 dark:hover:border-gray-400 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {((ticket as any).job_ref ?? formatJobId((ticket as any).job_number)) && (
              <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mb-0.5">{(ticket as any).job_ref ?? formatJobId((ticket as any).job_number)}</p>
            )}
            <p className="font-medium text-sm text-gray-900 dark:text-white truncate">{ticket.title}</p>
            {storeName && (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{storeName}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 truncate">
              Created: {formatDateTime(ticket.created_at)}
              {latestQuote && (
                <span className="ml-2 text-purple-500 dark:text-purple-400">
                  · Quoted: {formatDateTime(latestQuote.created_at)}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge className={PRIORITY_COLORS[ticket.priority]}>
              {PRIORITY_LABELS[ticket.priority]}
            </Badge>
            <Badge className={STATUS_COLORS[ticket.status]}>
              {STATUS_LABELS[ticket.status]}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  )
}

function CollapsibleSection({
  title, count, icon, children, colorClass = 'text-gray-500',
}: {
  title: string; count: number; icon: React.ReactNode; children: React.ReactNode; colorClass?: string
}) {
  // We use a details/summary element for zero-JS collapsing on a server component page
  return (
    <details className="group">
      <summary className="flex items-center justify-between cursor-pointer list-none bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-colors">
        <span className={`flex items-center gap-2 font-semibold text-sm ${colorClass}`}>
          {icon}
          {title}
          <span className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs px-1.5 py-0.5 rounded-full font-semibold">
            {count}
          </span>
        </span>
        <ChevronDown size={16} className="text-gray-400 group-open:hidden" />
        <ChevronUp   size={16} className="text-gray-400 hidden group-open:block" />
      </summary>
      <div className="mt-2 space-y-2">
        {children}
      </div>
    </details>
  )
}

export default async function RegionalStoreDetailPage({ params }: { params: { id: string } }) {
  const supabase    = createClient()
  const adminClient = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: store }, { data: tickets }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('*')
      .eq('id', params.id)
      .eq('regional_manager_id', user.id)
      .in('role', ['store_manager', 'client'])
      .single(),
    adminClient
      .from('tickets')
      .select('*, quotes(*)')
      .eq('client_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (!store) notFound()

  const ticketList = (tickets ?? []) as (Ticket & { quotes: Quote[] })[]
  const allQuotes  = ticketList.flatMap(t => t.quotes ?? [])

  // Ticket groups
  const openTickets       = ticketList.filter(t => t.status === 'open' || t.status === 'quoted')
  const urgentOpenTickets = openTickets.filter(t => t.priority === 'urgent')
  const normalOpenTickets = openTickets.filter(t => t.priority !== 'urgent')
  const declinedTickets   = ticketList.filter(t => t.status === 'declined')
  const inProgressTickets = ticketList.filter(t => ['in_progress', 'accepted', 'variation_accepted'].includes(t.status))
  const pendingSignOff    = ticketList.filter(t => t.status === 'pending_sign_off')
  const snagTickets       = ticketList.filter(t => t.status === 'snag' || t.status === 'snag_in_progress')
  const completedTickets  = ticketList.filter(t => t.status === 'completed')
  const cancelledTickets  = ticketList.filter(t => t.status === 'cancelled')

  // Archived tickets = completed + declined, newest first (by last update)
  const archivedTickets = [...completedTickets, ...declinedTickets]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

  // Quote groups
  const pendingQuotes = ticketList
    .flatMap(t => (t.quotes ?? []).map((q: any) => ({ ...q, ticketTitle: t.title, ticketId: t.id })))
    .filter((q: any) => q.status === 'pending')

  // Stats
  const acceptedQ   = allQuotes.filter((q: any) => q.status === 'accepted').length
  const declinedQ   = allQuotes.filter((q: any) => q.status === 'declined').length
  const pendingQ    = allQuotes.filter((q: any) => q.status === 'pending').length
  const snagQ       = snagTickets.length
  const acceptedValue = allQuotes.filter((q: any) => q.status === 'accepted').reduce((s: number, q: any) => s + (q.amount ?? 0), 0)
  const pendingValue  = allQuotes.filter((q: any) => q.status === 'pending').reduce((s: number, q: any) => s + (q.amount ?? 0), 0)
  const acceptanceRate = (acceptedQ + declinedQ) > 0
    ? Math.round((acceptedQ / (acceptedQ + declinedQ)) * 100)
    : null

  const mapsUrl = store.address
    ? `https://maps.google.com/?q=${encodeURIComponent(store.address)}`
    : null

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <BackButton />
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{store.company_name}</h1>
          <p className="text-sm text-brand-600 dark:text-brand-400">{store.sub_store}</p>
        </div>
      </div>

      {/* Info + summary grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* Store contact */}
        <div className="order-1 sm:order-none bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Store Contact</p>
          {store.full_name && (
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Building2 size={14} className="text-gray-400 shrink-0" /><span>{store.full_name}</span>
            </div>
          )}
          {store.email && (
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Mail size={14} className="text-gray-400 shrink-0" />
              <a href={`mailto:${store.email}`} className="hover:underline truncate">{store.email}</a>
            </div>
          )}
          {store.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <Phone size={14} className="text-gray-400 shrink-0" />
              <a href={`tel:${store.phone}`} className="hover:underline">{store.phone}</a>
            </div>
          )}
          {store.address && (
            <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
              <MapPin size={14} className="text-gray-400 shrink-0 mt-0.5" />
              {mapsUrl ? (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                  className="hover:underline text-brand-600 dark:text-brand-400">
                  {store.address}
                </a>
              ) : (
                <span>{store.address}</span>
              )}
            </div>
          )}
        </div>

        {/* Ticket summary */}
        <div className="order-2 sm:order-none bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 text-center">Ticket Summary</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Total',       value: ticketList.length,        color: 'text-gray-900 dark:text-white', href: `/regional/tickets?store=${params.id}` },
              { label: 'Open',        value: openTickets.length,       color: 'text-blue-600',  href: `/regional/tickets?status=open&store=${params.id}` },
              { label: 'Approved',    value: inProgressTickets.length, color: 'text-green-600', href: `/regional/tickets?status=accepted&store=${params.id}` },
              { label: 'In Progress', value: ticketList.filter(t => t.status === 'in_progress').length, color: 'text-amber-600', href: `/regional/tickets?status=in_progress&store=${params.id}` },
              { label: 'Completed',   value: completedTickets.length,  color: 'text-green-600', href: `/regional/tickets?status=completed&store=${params.id}` },
              { label: 'Declined',    value: declinedTickets.length,   color: 'text-red-500',   href: `/regional/tickets?status=declined&store=${params.id}` },
            ].map(s => (
              <Link key={s.label} href={s.href} className="group">
                <p className={`text-2xl font-bold ${s.color} group-hover:underline`}>{s.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{s.label}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* Quote overview (merged: totals + awaiting approval) */}
        <div className="order-4 sm:order-none bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Quote Overview</p>
          <div className="space-y-3">
            {/* Accepted value — own line */}
            <div>
              <p className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(acceptedValue)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total Accepted Value</p>
            </div>
            {/* Awaiting approval value — own line */}
            <div>
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(pendingValue)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Awaiting Approval Value</p>
            </div>
            {/* Breakdown bar — accepted / awaiting / declined / snag */}
            {(acceptedQ + pendingQ + declinedQ + snagQ) > 0 && (() => {
              const totalQ = acceptedQ + pendingQ + declinedQ + snagQ
              const w = (n: number) => `${(n / totalQ) * 100}%`
              return (
                <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
                  {acceptedQ > 0 && <div className="h-full bg-green-500"  style={{ width: w(acceptedQ) }} />}
                  {pendingQ  > 0 && <div className="h-full bg-yellow-500" style={{ width: w(pendingQ)  }} />}
                  {declinedQ > 0 && <div className="h-full bg-red-500"    style={{ width: w(declinedQ) }} />}
                  {snagQ     > 0 && <div className="h-full bg-purple-500" style={{ width: w(snagQ)     }} />}
                </div>
              )
            })()}
            <div className="flex gap-3 flex-wrap">
              <div>
                <p className="text-lg font-bold text-yellow-600">{pendingQ}</p>
                <p className="text-xs text-gray-400">Pending</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{acceptedQ}</p>
                <p className="text-xs text-gray-400">Accepted</p>
              </div>
              <div>
                <p className="text-lg font-bold text-red-500">{declinedQ}</p>
                <p className="text-xs text-gray-400">Declined</p>
              </div>
              {snagQ > 0 && (
                <div>
                  <p className="text-lg font-bold text-purple-500">{snagQ}</p>
                  <p className="text-xs text-gray-400">Snag</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Budget allowance (Capex) — clickable, opens edit page */}
        <Link href={`/regional/stores/${params.id}/budget`} className="order-3 sm:order-none group block">
          <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 h-full hover:border-brand-400 dark:hover:border-gray-400 transition-colors">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Budget Allowance (Capex)</p>
            {store.capex_budget != null ? (
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(store.capex_budget)}</p>
            ) : (
              <p className="text-base font-medium text-gray-400">Not set</p>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Per month</p>
          </div>
        </Link>
      </div>

      {/* ── URGENT OPEN TICKETS ── */}
      {urgentOpenTickets.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500" />
            Urgent ({urgentOpenTickets.length})
          </h2>
          <RecentTicketsStack tickets={urgentOpenTickets as any} variant="client" basePath="/regional/tickets" />
        </div>
      )}

      {/* ── OPEN TICKETS ── */}
      {normalOpenTickets.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <AlertCircle size={16} className="text-blue-500" />
            Open Tickets ({normalOpenTickets.length})
          </h2>
          <RecentTicketsStack tickets={normalOpenTickets as any} variant="client" basePath="/regional/tickets" />
        </div>
      )}

      {/* ── IN PROGRESS / APPROVED ── */}
      {inProgressTickets.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            In Progress / Approved ({inProgressTickets.length})
          </h2>
          <div className="space-y-2">
            {inProgressTickets.map(t => <TicketRow key={t.id} ticket={t} />)}
          </div>
        </div>
      )}

      {/* ── PENDING SIGN-OFF ── */}
      {pendingSignOff.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <Clock size={16} className="text-orange-500" />
            Pending Sign-off ({pendingSignOff.length})
          </h2>
          <div className="space-y-2">
            {pendingSignOff.map(t => <TicketRow key={t.id} ticket={t} />)}
          </div>
        </div>
      )}

      {/* ── SNAG (collapsible) ── */}
      {snagTickets.length > 0 && (
        <CollapsibleSection
          title="Snag"
          count={snagTickets.length}
          icon={<AlertTriangle size={16} className="text-rose-500" />}
          colorClass="text-amber-700 dark:text-amber-400"
        >
          {snagTickets.map(t => <TicketRow key={t.id} ticket={t} />)}
        </CollapsibleSection>
      )}

      {ticketList.length === 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center">
          <p className="text-sm text-gray-400">No tickets from this store yet.</p>
        </div>
      )}

      {/* ── QUOTES AWAITING APPROVAL ── */}
      {pendingQuotes.length > 0 && (
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
            <FileText size={16} className="text-yellow-500" />
            Quotes Awaiting Your Approval ({pendingQuotes.length})
          </h2>
          <div className="space-y-3">
            {(pendingQuotes as any[]).map((q: any) => (
              <QuoteApprovalCard
                key={q.id}
                quote={q as Quote}
                ticketTitle={q.ticketTitle}
                ticketId={q.ticketId}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── CANCELLED (collapsible) ── */}
      {cancelledTickets.length > 0 && (
        <CollapsibleSection
          title="Cancelled"
          count={cancelledTickets.length}
          icon={<Archive size={16} className="text-gray-400" />}
        >
          {cancelledTickets.map(t => (
            <div key={t.id} className="opacity-60">
              <TicketRow ticket={t} />
            </div>
          ))}
        </CollapsibleSection>
      )}

      {/* ── TICKETS ARCHIVED (completed + declined tickets, collapsible) ── */}
      {archivedTickets.length > 0 && (
        <CollapsibleSection
          title="Tickets Archived"
          count={archivedTickets.length}
          icon={<Archive size={16} className="text-gray-400" />}
        >
          {archivedTickets.map(t => {
            const isCompleted = t.status === 'completed'
            const acceptedQuote = ((t as any).quotes ?? []).find((q: any) => q.status === 'accepted')
            return (
              <Link key={t.id} href={`/regional/tickets/${t.id}`}>
                <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 flex items-center justify-between gap-3 hover:border-brand-400 dark:hover:border-gray-400 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{t.title}</p>
                    {isCompleted && acceptedQuote && (
                      <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-0.5">
                        {formatCurrency(acceptedQuote.amount)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {isCompleted
                        ? `Completed: ${formatDateTime(t.updated_at)}`
                        : `Declined: ${formatDate(t.updated_at)}`}
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full ${
                    isCompleted
                      ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                  }`}>
                    {isCompleted ? 'Completed' : 'Declined'}
                  </span>
                </div>
              </Link>
            )
          })}
        </CollapsibleSection>
      )}

    </div>
  )
}
