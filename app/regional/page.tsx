export const dynamic = 'force-dynamic'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { RecentTicketsStack } from '@/components/regional/RecentTicketsStack'
import {
  Building2, ShieldAlert, ReceiptText,
  TrendingUp, CheckCircle2, Zap, ClipboardList,
  Wrench, BadgeCheck, Banknote, Clock4, Layers,
  Activity, AlertTriangle, Sparkles,
} from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import {
  STATUS_COLORS, STATUS_LABELS, PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, formatCurrency,
} from '@/lib/utils'
import type { Ticket, Quote } from '@/lib/types'

export default async function RegionalDashboard() {
  const supabase      = createClient()
  const adminClient   = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: rmProfile }, { data: stores }] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single(),
    adminClient
      .from('profiles')
      .select(`
        id, full_name, company_name, sub_store, email, phone, address,
        tickets(
          id, job_number, title, status, priority, created_at, updated_at,
          quotes(status, amount, created_at, type)
        )
      `)
      .eq('regional_manager_id', user.id)
      .in('role', ['store_manager', 'client'])
      .is('closed_at', null)
      .order('company_name'),
  ])

  if (rmProfile?.role !== 'regional_manager') redirect('/auth/login')

  const storeList = (stores ?? []) as any[]

  const allTickets = storeList.flatMap((s: any) => s.tickets ?? [])
  const allQuotes  = allTickets.flatMap((t: any) => t.quotes ?? [])

  const totalTickets          = allTickets.length
  const completedTickets      = allTickets.filter((t: any) => t.status === 'completed').length
  const openActiveTickets     = allTickets.filter((t: any) => ['open','quoted','accepted','in_progress','variation_accepted'].includes(t.status)).length
  const pendingSignOffTickets = allTickets.filter((t: any) => t.status === 'pending_sign_off').length
  const snagTickets           = allTickets.filter((t: any) => ['snag', 'snag_in_progress'].includes(t.status)).length
  const declinedTickets       = allTickets.filter((t: any) => t.status === 'declined').length

  const completionPct     = totalTickets > 0 ? Math.round((completedTickets      / totalTickets) * 100) : 0
  const openPct           = totalTickets > 0 ? Math.round((openActiveTickets    / totalTickets) * 100) : 0
  const pendingSignOffPct = totalTickets > 0 ? Math.round((pendingSignOffTickets / totalTickets) * 100) : 0
  const snagPct           = totalTickets > 0 ? Math.round((snagTickets           / totalTickets) * 100) : 0
  const declinedPct       = totalTickets > 0 ? Math.round((declinedTickets       / totalTickets) * 100) : 0

  // ── Portfolio health: per-store health = % of tickets settled (completed /
  // declined / cancelled). Portfolio = average across stores that have tickets.
  const storeHealth = storeList.map((s: any) => {
    const tk = s.tickets ?? []
    const total   = tk.length
    const settled = tk.filter((t: any) => ['completed', 'declined', 'cancelled'].includes(t.status)).length
    return {
      id:           s.id,
      company_name: s.company_name,
      sub_store:    s.sub_store,
      total,
      health:     total > 0 ? Math.round((settled / total) * 100) : null,
      urgent:     tk.filter((t: any) => t.priority === 'urgent' && !['completed', 'cancelled', 'declined'].includes(t.status)).length,
      snag:       tk.filter((t: any) => ['snag', 'snag_in_progress'].includes(t.status)).length,
      openActive: tk.filter((t: any) => ['open', 'quoted', 'accepted', 'in_progress', 'variation_accepted'].includes(t.status)).length,
      signOff:    tk.filter((t: any) => t.status === 'pending_sign_off').length,
    }
  })

  const ratedStores     = storeHealth.filter((s) => s.health !== null)
  const portfolioHealth = ratedStores.length > 0
    ? Math.round(ratedStores.reduce((sum, s) => sum + (s.health ?? 0), 0) / ratedStores.length)
    : null

  // Stores needing the RM's attention, most severe first
  const attentionStores = storeHealth
    .filter((s) => s.urgent > 0 || s.snag > 0 || (s.health !== null && s.health < 50))
    .sort((a, b) =>
      (b.urgent - a.urgent) ||
      (b.snag - a.snag) ||
      ((a.health ?? 100) - (b.health ?? 100))
    )

  // Stores running well (>= 85% health) with real activity
  const healthyStores = storeHealth
    .filter((s) => s.total > 0 && s.health !== null && s.health >= 85)
    .sort((a, b) => (b.health ?? 0) - (a.health ?? 0))

  // Portfolio health tier → label, badge classes + hex stroke for the gauge
  const healthTier = (h: number | null) => {
    if (h === null) return { label: 'No data',          stroke: '#9ca3af', text: 'text-gray-500 dark:text-gray-400',  badge: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' }
    if (h >= 85)    return { label: 'Excellent',        stroke: '#22c55e', text: 'text-green-600 dark:text-green-400', badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' }
    if (h >= 70)    return { label: 'Good',             stroke: '#84cc16', text: 'text-lime-600 dark:text-lime-400',   badge: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400' }
    if (h >= 50)    return { label: 'Fair',             stroke: '#f59e0b', text: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' }
    return { label: 'Needs attention', stroke: '#ef4444', text: 'text-red-600 dark:text-red-500', badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' }
  }
  const tier = healthTier(portfolioHealth)

  const assessment =
    portfolioHealth === null ? 'No ticket activity across your stores yet — nothing to action.'
    : portfolioHealth >= 85   ? `Portfolio is in excellent shape. ${healthyStores.length} of ${ratedStores.length} active store${ratedStores.length !== 1 ? 's' : ''} are resolving work effectively with little backlog — you're managing this region well.`
    : portfolioHealth >= 70   ? 'Portfolio is healthy overall. A few stores below need follow-up to stay ahead of the backlog.'
    : portfolioHealth >= 50   ? 'Several stores are carrying open work. Prioritise the flagged stores to lift overall portfolio health.'
    : 'Portfolio health is low. Multiple stores need immediate attention — start with the urgent and snag items below.'

  // SVG gauge geometry
  const gaugeR = 54
  const gaugeC = 2 * Math.PI * gaugeR
  const gaugeOffset = portfolioHealth === null ? gaugeC : gaugeC * (1 - portfolioHealth / 100)

  const stats = {
    totalStores:     storeList.length,
    openTickets:     openActiveTickets,
    urgentTickets:   allTickets.filter((t: any) => t.priority === 'urgent' && !['completed','cancelled','declined'].includes(t.status)).length,
    pendingQuotes:     allQuotes.filter((q: any) => q.status === 'pending' && q.type !== 'variation').length,
    pendingVariations: allQuotes.filter((q: any) => q.status === 'pending' && q.type === 'variation').length,
    completedThisMonth: allTickets.filter((t: any) => {
      if (t.status !== 'completed') return false
      const d = new Date(t.updated_at)
      const now = new Date()
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length,
    totalQuoteValue:   allQuotes.filter((q: any) => q.status === 'accepted').reduce((sum: number, q: any) => sum + (q.amount ?? 0), 0),
    pendingQuoteValue: allQuotes.filter((q: any) => q.status === 'pending').reduce((sum: number, q: any) => sum + (q.amount ?? 0), 0),
  }


  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // Attach store info to every ticket once, reused by both lists below
  const storeByTicketId = new Map<string, any>()
  for (const s of storeList) {
    for (const st of (s.tickets ?? [])) storeByTicketId.set(st.id, s)
  }
  const ticketsWithStore = allTickets.map((t: any) => ({ ...t, store: storeByTicketId.get(t.id) }))

  const attentionTickets = ticketsWithStore
    .filter((t: any) => {
      const isPriority = ['urgent', 'high'].includes(t.priority) && !['completed', 'cancelled', 'declined'].includes(t.status)
      const isStaleOpen = t.status === 'open' && Date.now() - new Date(t.created_at).getTime() > 7 * 86_400_000
      return isPriority || isStaleOpen
    })
    .sort((a: any, b: any) => {
      if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
      if (b.priority === 'urgent' && a.priority !== 'urgent') return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const recentTickets = ticketsWithStore
    .filter((t: any) =>
      new Date(t.created_at) >= sevenDaysAgo &&
      !['completed', 'declined', 'cancelled'].includes(t.status)
    )
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const storePerformance = storeList.map((s: any) => {
    const tickets = s.tickets ?? []
    const quotes  = tickets.flatMap((t: any) => t.quotes ?? [])
    const accepted = quotes.filter((q: any) => q.status === 'accepted').length
    const total    = quotes.filter((q: any) => q.status !== 'pending').length
    return {
      ...s,
      ticketCounts: {
        open:             tickets.filter((t: any) => t.status === 'open').length,
        in_progress:      tickets.filter((t: any) => t.status === 'in_progress').length,
        completed:        tickets.filter((t: any) => t.status === 'completed').length,
        pending_sign_off: tickets.filter((t: any) => t.status === 'pending_sign_off').length,
        total:            tickets.length,
      },
      acceptanceRate: total > 0 ? Math.round((accepted / total) * 100) : null,
      lastActivity: tickets.length > 0
        ? tickets.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0].created_at
        : null,
    }
  })

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div className="space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {greeting}, {rmProfile.full_name?.split(' ')[0] ?? 'Manager'} 👋
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Regional overview · {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* 1 — Portfolio health */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Gauge */}
          <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
              <circle cx="70" cy="70" r={gaugeR} fill="none" strokeWidth="12" className="stroke-gray-100 dark:stroke-gray-700" />
              <circle
                cx="70" cy="70" r={gaugeR} fill="none" strokeWidth="12" strokeLinecap="round"
                stroke={tier.stroke} strokeDasharray={gaugeC} strokeDashoffset={gaugeOffset}
                className="transition-all duration-500"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-3xl font-bold ${tier.text}`}>{portfolioHealth === null ? '—' : `${portfolioHealth}%`}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Health</span>
            </div>
          </div>

          {/* Summary */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start flex-wrap gap-2">
              <Activity size={18} className={tier.text} />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Portfolio Health</h2>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tier.badge}`}>{tier.label}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Average across {ratedStores.length} active store{ratedStores.length !== 1 ? 's' : ''}
              {storeList.length !== ratedStores.length && ` · ${storeList.length - ratedStores.length} with no tickets`}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-4">
              <div className="rounded-lg bg-slate-50 dark:bg-gray-900/40 px-3 py-2">
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{healthyStores.length}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Healthy ≥85%</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-gray-900/40 px-3 py-2">
                <p className="text-lg font-bold text-red-600 dark:text-red-400">{attentionStores.length}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Need attention</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-gray-900/40 px-3 py-2">
                <p className="text-lg font-bold text-gray-900 dark:text-white">{stats.totalStores}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Total stores</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2 — Executive summary */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList size={18} className="text-brand-600 dark:text-brand-400" />
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Executive Summary</h2>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{assessment}</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Requires attention */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle size={15} className="text-red-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Requires Attention</h3>
            </div>
            {attentionStores.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No stores flagged — every store is on track.</p>
            ) : (
              <ul className="space-y-2.5">
                {attentionStores.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={`/regional/stores/${s.id}`} className="flex items-center justify-between gap-2 group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{s.company_name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{s.sub_store}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.urgent > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{s.urgent} urgent</span>}
                        {s.snag > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400">{s.snag} snag</span>}
                        {s.health !== null && s.health < 50 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{s.health}%</span>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {attentionStores.length > 5 && (
              <Link href="/regional/stores" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-3 inline-block">
                +{attentionStores.length - 5} more →
              </Link>
            )}
          </div>

          {/* Performing well */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={15} className="text-green-500" />
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Performing Well</h3>
            </div>
            {healthyStores.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500">No stores above 85% yet — keep clearing open tickets to get there.</p>
            ) : (
              <ul className="space-y-2.5">
                {healthyStores.slice(0, 5).map((s) => (
                  <li key={s.id}>
                    <Link href={`/regional/stores/${s.id}`} className="flex items-center justify-between gap-2 group">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400">{s.company_name}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{s.sub_store}</p>
                      </div>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">{s.health}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {healthyStores.length > 5 && (
              <Link href="/regional/stores" className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-3 inline-block">
                +{healthyStores.length - 5} more →
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 3 — Ticket status bar */}
      {totalTickets > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-200">Ticket Status Overview</span>
            <span className="text-gray-500 dark:text-gray-400">{completedTickets} of {totalTickets} completed</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all rounded-l-full" style={{ width: `${completionPct}%` }} />
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${openPct}%` }} />
            {pendingSignOffPct > 0 && <div className="h-full bg-orange-500 transition-all" style={{ width: `${pendingSignOffPct}%` }} />}
            {snagPct > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${snagPct}%` }} />}
            {declinedPct > 0 && <div className="h-full bg-fuchsia-500 transition-all" style={{ width: `${declinedPct}%` }} />}
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{completionPct}% Completed ({completedTickets})
            </span>
            <span className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />{openPct}% Open ({openActiveTickets})
            </span>
            {pendingSignOffTickets > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-orange-600 dark:text-orange-400">
                <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />{pendingSignOffPct}% Pending Sign-off ({pendingSignOffTickets})
              </span>
            )}
            {snagTickets > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-red-700 dark:text-red-400">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{snagPct}% Snag ({snagTickets})
              </span>
            )}
            {declinedTickets > 0 && (
              <span className="flex items-center gap-1.5 font-medium text-fuchsia-600 dark:text-fuchsia-400">
                <span className="w-2 h-2 rounded-full bg-fuchsia-500 inline-block" />{declinedPct}% Declined ({declinedTickets})
              </span>
            )}
          </div>
        </div>
      )}

      {/* 4 — Summary stats (compact) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
        {[
          { label: 'Stores You\nManage', value: stats.totalStores,                   icon: Building2,     accent: 'border-l-brand-500',   iconCls: 'text-brand-600 dark:text-brand-400',   href: '/regional/stores' },
          { label: 'Open Tickets',     value: stats.openTickets,                     icon: ClipboardList, accent: 'border-l-blue-500',    iconCls: 'text-blue-600 dark:text-blue-400',     href: '/regional/tickets' },
          { label: 'Urgent',           value: stats.urgentTickets,                   icon: ShieldAlert,   accent: 'border-l-red-500',     iconCls: 'text-red-600 dark:text-red-400',       href: '/regional/tickets?status=open' },
          { label: 'Quotes Pending\nApproval', value: stats.pendingQuotes,           icon: ReceiptText,   accent: 'border-l-yellow-500',  iconCls: 'text-yellow-600 dark:text-yellow-400', href: '/regional/tickets?status=quoted' },
          { label: 'Variations Pending\nApproval', value: stats.pendingVariations,    icon: Layers,        accent: 'border-l-indigo-500',  iconCls: 'text-indigo-600 dark:text-indigo-400', href: '/regional/tickets?status=variation_pending' },
          { label: 'Snag',             value: snagTickets,                           icon: Wrench,        accent: 'border-l-amber-500',   iconCls: 'text-amber-600 dark:text-amber-400',   href: '/regional/snag' },
          { label: 'Pending\nSign-off', value: pendingSignOffTickets,                 icon: BadgeCheck,    accent: 'border-l-orange-500',  iconCls: 'text-orange-600 dark:text-orange-400', href: '/regional/signoff' },
          { label: 'Done This Month',  value: stats.completedThisMonth,              icon: CheckCircle2,  accent: 'border-l-green-500',   iconCls: 'text-green-600 dark:text-green-400',   href: '/regional/tickets?status=completed' },
          { label: 'Accepted Value',   value: formatCurrency(stats.totalQuoteValue),   icon: Banknote,  accent: 'border-l-purple-500', iconCls: 'text-purple-600 dark:text-purple-400', href: null, currency: true },
          { label: 'Pending Value',    value: formatCurrency(stats.pendingQuoteValue),  icon: Clock4,    accent: 'border-l-slate-400',  iconCls: 'text-slate-500 dark:text-slate-400',   href: null, currency: true },
        ].map(stat => {
          const isCurrency = (stat as any).currency === true
          const inner = isCurrency ? (
            /* Currency card — stacked layout so long values never overflow */
            <div className={`bg-slate-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${stat.accent} p-3 flex flex-col justify-between gap-1.5 h-full`}>
              <div className="flex items-center gap-1.5">
                <stat.icon size={14} className={`shrink-0 ${stat.iconCls}`} />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium leading-tight">{stat.label}</p>
              </div>
              <p className="text-sm font-bold text-gray-900 dark:text-white leading-snug break-words">{stat.value}</p>
            </div>
          ) : (
            /* Numeric card — horizontal layout */
            <div className={`bg-slate-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 border-l-4 ${stat.accent} p-3 flex items-center gap-3 h-full`}>
              <stat.icon size={18} className={`shrink-0 ${stat.iconCls}`} />
              <div className="min-w-0">
                <p className="text-lg font-bold text-gray-900 dark:text-white leading-none">{stat.value}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 whitespace-pre-line leading-tight">{stat.label}</p>
              </div>
            </div>
          )
          return stat.href
            ? <Link key={stat.label} href={(stat as any).href} className="hover:opacity-80 transition-opacity">{inner}</Link>
            : <div key={stat.label}>{inner}</div>
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* LEFT — Needs Attention (first on mobile too) */}
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
              tickets={attentionTickets}
              variant="regional"
              basePath="/regional/tickets"
              countLabel="need attention"
            />
          )}
        </div>

        {/* RIGHT — Recent Tickets */}
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <Clock4 size={16} className="text-brand-600 dark:text-brand-300" /> Recent Tickets
          </h2>
          <RecentTicketsStack
            tickets={recentTickets}
            variant="regional"
            basePath="/regional/tickets"
            countLabel="last 7 days"
          />
        </div>
      </div>
    </div>
  )
}

