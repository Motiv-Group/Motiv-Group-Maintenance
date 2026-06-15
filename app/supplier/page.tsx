export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatCurrency } from '@/lib/utils'
import { RecentTicketsStack } from '@/components/regional/RecentTicketsStack'
import {
  Star, ClipboardList, ShieldAlert,
  ReceiptText, Wrench, BadgeCheck, CheckCircle2,
  Banknote, Clock4, Hash, Zap,
} from 'lucide-react'

export default async function AdminDashboard() {
  const supabase = createClient()
  const adminDb  = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoISO = sevenDaysAgo.toISOString()

  const [ticketsResult, recentTicketsResult, attentionTicketsResult, ratingsResult, profileResult] = await Promise.all([
    supabase
      .from('tickets')
      .select('id, status, priority, created_at, quotes(status, amount)')
      .order('created_at', { ascending: false }),
    supabase
      .from('tickets')
      .select('id, job_number, title, status, priority, created_at, profiles(full_name, company_name, sub_store), quotes(status, created_at)')
      .gte('created_at', sevenDaysAgoISO)
      .not('status', 'in', '(completed,cancelled,declined)')
      .order('created_at', { ascending: false }),
    supabase
      .from('tickets')
      .select('id, job_number, title, status, priority, created_at, profiles(full_name, company_name, sub_store), quotes(status, created_at)')
      .in('priority', ['urgent', 'high'])
      .not('status', 'in', '(completed,cancelled,declined)')
      .order('created_at', { ascending: false })
      .limit(30),
    user
      ? adminDb.from('ratings').select('score').eq('contractor_id', user.id)
      : Promise.resolve({ data: [] }),
    user
      ? supabase.from('profiles').select('company_name').eq('id', user.id).single()
      : Promise.resolve({ data: null }),
  ])

  const tickets       = ticketsResult.data ?? []
  const recentTickets = recentTicketsResult.data ?? []
  const attentionTickets = (attentionTicketsResult.data ?? []).sort((a: any, b: any) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
    if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const companyName   = (profileResult as any).data?.company_name ?? 'Dashboard'
  const ratings     = (ratingsResult as any).data ?? []
  const ratingCount = ratings.length
  const avgRating   = ratingCount > 0
    ? ratings.reduce((sum: number, r: any) => sum + r.score, 0) / ratingCount
    : null

  const total          = tickets.length
  const openCount      = tickets.filter(t => t.status === 'open').length
  const declinedCount  = tickets.filter(t => t.status === 'declined').length
  const urgentCount    = tickets.filter(t => t.priority === 'urgent' && t.status === 'open').length
  const quotedCount    = tickets.filter(t => t.status === 'quoted').length
  const acceptedCount  = tickets.filter(t => t.status === 'accepted').length
  const progressCount  = tickets.filter(t => ['in_progress', 'variation_accepted'].includes(t.status)).length
  const signOffCount   = tickets.filter(t => t.status === 'pending_sign_off').length
  const snagCount      = tickets.filter(t => ['snag','snag_in_progress'].includes(t.status)).length
  const completedCount = tickets.filter(t => t.status === 'completed').length
  const cancelledCount = tickets.filter(t => t.status === 'cancelled').length

  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0

  const allQuotes     = tickets.flatMap((t: any) => t.quotes ?? [])
  const acceptedValue = allQuotes.filter((q: any) => q.status === 'accepted').reduce((s: number, q: any) => s + (q.amount ?? 0), 0)
  const pendingValue  = allQuotes.filter((q: any) => q.status === 'pending').reduce((s: number, q: any) => s + (q.amount ?? 0), 0)

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{companyName}</h1>
        <Link href="/supplier/reviews">
          {avgRating !== null ? (
            <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-xl px-4 py-2 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors">
              <Star size={16} className="fill-amber-400 text-amber-400 shrink-0" />
              <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{avgRating.toFixed(1)} / 5</span>
              <span className="text-xs text-amber-600 dark:text-amber-400">({ratingCount} review{ratingCount !== 1 ? 's' : ''})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <Star size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
              <span className="text-xs text-gray-400">No ratings yet</span>
            </div>
          )}
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {/* Numeric cards */}
        {[
          { label: 'Total Tickets',    value: total,                     icon: Hash,          accent: 'border-l-gray-400',   iconCls: 'text-gray-500 dark:text-gray-400',   href: '/supplier/tickets' },
          { label: 'Open Tickets',     value: openCount + declinedCount, icon: ClipboardList, accent: 'border-l-blue-500',   iconCls: 'text-blue-600 dark:text-blue-400',   href: '/supplier/tickets?status=open' },
          { label: 'Urgent',           value: urgentCount,               icon: ShieldAlert,   accent: 'border-l-red-500',    iconCls: 'text-red-600 dark:text-red-400',     href: '/supplier/tickets?status=open' },
          { label: 'Quoted',           value: quotedCount,               icon: ReceiptText,   accent: 'border-l-purple-500', iconCls: 'text-purple-600 dark:text-purple-400', href: '/supplier/tickets?status=quoted' },
          { label: 'In Progress',      value: progressCount,             icon: Wrench,        accent: 'border-l-amber-500',  iconCls: 'text-amber-600 dark:text-amber-400', href: '/supplier/tickets?status=in_progress' },
          { label: 'Pending\nSign-off', value: signOffCount,              icon: BadgeCheck,    accent: 'border-l-orange-500', iconCls: 'text-orange-600 dark:text-orange-400', href: '/supplier/tickets?status=pending_sign_off' },
          { label: 'Snag',             value: snagCount,                 icon: ShieldAlert,   accent: 'border-l-rose-500',   iconCls: 'text-rose-600 dark:text-rose-400',   href: '/supplier/snag' },
          { label: 'Completed',        value: completedCount,            icon: CheckCircle2,  accent: 'border-l-green-500',  iconCls: 'text-green-600 dark:text-green-400', href: '/supplier/tickets?status=completed' },
        ].map(stat => (
          <Link key={stat.label} href={stat.href}>
            <div className={`bg-slate-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${stat.accent} p-4 flex items-center gap-3 hover:opacity-80 transition-opacity h-full`}>
              <stat.icon size={22} className={`shrink-0 ${stat.iconCls}`} />
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{stat.label}</p>
              </div>
            </div>
          </Link>
        ))}

        {/* Currency cards — stacked layout so long values never overflow */}
        {[
          { label: 'Accepted Value', value: formatCurrency(acceptedValue), icon: Banknote, accent: 'border-l-green-500',  iconCls: 'text-green-600 dark:text-green-400'  },
          { label: 'Pending Value',  value: formatCurrency(pendingValue),  icon: Clock4,   accent: 'border-l-yellow-500', iconCls: 'text-yellow-600 dark:text-yellow-400' },
        ].map(stat => (
          <div key={stat.label} className={`bg-slate-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${stat.accent} p-4 flex flex-col justify-between gap-2 h-full`}>
            <div className="flex items-center gap-2">
              <stat.icon size={15} className={`shrink-0 ${stat.iconCls}`} />
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug break-words">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Full status progress bar */}
      {total > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">Ticket Status Overview</span>
            <span className="text-gray-500 dark:text-gray-400">{completedCount} of {total} completed</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-700">
            {completedCount  > 0 && <div className="h-full bg-green-500"  style={{ width: `${pct(completedCount)}%` }} />}
            {progressCount   > 0 && <div className="h-full bg-amber-500"  style={{ width: `${pct(progressCount)}%` }} />}
            {acceptedCount   > 0 && <div className="h-full bg-teal-500"   style={{ width: `${pct(acceptedCount)}%` }} />}
            {quotedCount     > 0 && <div className="h-full bg-cyan-500"   style={{ width: `${pct(quotedCount)}%` }} />}
            {openCount       > 0 && <div className="h-full bg-blue-500"   style={{ width: `${pct(openCount)}%` }} />}
            {signOffCount    > 0 && <div className="h-full bg-orange-500" style={{ width: `${pct(signOffCount)}%` }} />}
            {snagCount       > 0 && <div className="h-full bg-red-500"    style={{ width: `${pct(snagCount)}%` }} />}
            {declinedCount   > 0 && <div className="h-full bg-fuchsia-500" style={{ width: `${pct(declinedCount)}%` }} />}
            {cancelledCount  > 0 && <div className="h-full bg-gray-400"   style={{ width: `${pct(cancelledCount)}%` }} />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
            {completedCount > 0 && <span className="flex items-center gap-1.5 text-green-700 dark:text-green-400"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{pct(completedCount)}% Completed ({completedCount})</span>}
            {progressCount  > 0 && <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{pct(progressCount)}% In Progress ({progressCount})</span>}
            {acceptedCount  > 0 && <span className="flex items-center gap-1.5 text-teal-700 dark:text-teal-400"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />{pct(acceptedCount)}% Accepted ({acceptedCount})</span>}
            {quotedCount    > 0 && <span className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400"><span className="w-2 h-2 rounded-full bg-cyan-500 inline-block" />{pct(quotedCount)}% Quoted ({quotedCount})</span>}
            {openCount      > 0 && <span className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{pct(openCount)}% Open ({openCount})</span>}
            {signOffCount   > 0 && <span className="flex items-center gap-1.5 text-orange-700 dark:text-orange-400"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />{pct(signOffCount)}% Sign-off ({signOffCount})</span>}
            {snagCount      > 0 && <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{pct(snagCount)}% Snag ({snagCount})</span>}
            {declinedCount  > 0 && <span className="flex items-center gap-1.5 text-fuchsia-600 dark:text-fuchsia-400"><span className="w-2 h-2 rounded-full bg-fuchsia-500 inline-block" />{pct(declinedCount)}% Declined ({declinedCount})</span>}
            {cancelledCount > 0 && <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />{pct(cancelledCount)}% Cancelled ({cancelledCount})</span>}
          </div>
        </div>
      )}

      {/* Two-column grid: Needs Attention first (top on mobile), Recent Tickets second */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT — Needs Attention */}
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <Zap size={16} className="text-red-500" /> Needs Attention
          </h2>
          {attentionTickets.length === 0 ? (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-4 text-center">
              <CheckCircle2 size={20} className="mx-auto text-green-500 mb-1" />
              <p className="text-xs text-green-700 dark:text-green-400">No urgent or high priority tickets — all clear!</p>
            </div>
          ) : (
            <RecentTicketsStack
              tickets={attentionTickets as any}
              variant="supplier"
              basePath="/supplier/tickets"
              countLabel="need attention"
            />
          )}
        </div>

        {/* RIGHT — Recent Tickets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock4 size={16} className="text-brand-600 dark:text-brand-300" /> Recent Tickets
            </h2>
            <Link href="/supplier/tickets" className="text-sm text-brand-600 dark:text-brand-300 hover:underline">View all</Link>
          </div>
          <RecentTicketsStack
            tickets={recentTickets as any}
            variant="supplier"
            basePath="/supplier/tickets"
            countLabel="last 7 days"
          />
        </div>
      </div>
    </div>
  )
}

