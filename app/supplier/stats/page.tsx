export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import {
  BarChart2, ClipboardList, CheckCircle2, Wrench,
  ShieldAlert, TrendingUp, Users, Building2, ReceiptText,
} from 'lucide-react'

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 w-8 text-right">{value}</span>
    </div>
  )
}

function DonutRing({ pct, color }: { pct: number; color: string }) {
  const r = 36, circ = 2 * Math.PI * r, dash = (pct / 100) * circ
  return (
    <svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-gray-100 dark:text-gray-700" />
      <circle cx="45" cy="45" r={r} fill="none" strokeWidth="10" stroke={color}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 45 45)" />
      <text x="45" y="49" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" className="text-gray-900 dark:text-white">
        {pct}%
      </text>
    </svg>
  )
}

export default async function AdminStatsPage() {
  const db = createAdminClient()

  const [{ data: tickets }, { data: quotes }, { data: profiles }] = await Promise.all([
    db.from('tickets').select('id, status, priority, created_at, updated_at, client_id'),
    db.from('quotes').select('id, status, amount, created_at'),
    db.from('profiles').select('id, role, company_name, sub_store, regional_manager_id'),
  ])

  const t = tickets  ?? []
  const q = quotes   ?? []
  const p = profiles ?? []

  const byStatus = {
    open:             t.filter(x => x.status === 'open').length,
    quoted:           t.filter(x => x.status === 'quoted').length,
    accepted:         t.filter(x => x.status === 'accepted').length,
    in_progress:      t.filter(x => x.status === 'in_progress').length,
    pending_sign_off: t.filter(x => x.status === 'pending_sign_off').length,
    snag:             t.filter(x => x.status === 'snag').length,
    completed:        t.filter(x => x.status === 'completed').length,
    cancelled:        t.filter(x => x.status === 'cancelled').length,
    declined:         t.filter(x => x.status === 'declined').length,
  }
  const byPriority = {
    urgent: t.filter(x => x.priority === 'urgent').length,
    high:   t.filter(x => x.priority === 'high').length,
    medium: t.filter(x => x.priority === 'medium').length,
    low:    t.filter(x => x.priority === 'low').length,
  }

  const qAccepted     = q.filter(x => x.status === 'accepted').length
  const qDeclined     = q.filter(x => x.status === 'declined').length
  const qPending      = q.filter(x => x.status === 'pending').length
  const qValue        = q.filter(x => x.status === 'accepted').reduce((s, x) => s + (x.amount ?? 0), 0)
  const qPendingValue = q.filter(x => x.status === 'pending').reduce((s, x)  => s + (x.amount ?? 0), 0)
  const acceptRate    = (qAccepted + qDeclined) > 0 ? Math.round((qAccepted / (qAccepted + qDeclined)) * 100) : 0

  const totalTickets  = t.length
  const openTickets   = byStatus.open + byStatus.quoted + byStatus.accepted + byStatus.in_progress
    + byStatus.pending_sign_off + byStatus.snag + byStatus.declined
  const completionPct = totalTickets > 0 ? Math.round((byStatus.completed / totalTickets) * 100) : 0
  const openPct       = totalTickets > 0 ? Math.round((openTickets / totalTickets) * 100) : 0

  const stores     = p.filter(x => x.role === 'store_manager' || x.role === 'client')
  const rms        = p.filter(x => x.role === 'regional_manager')
  const unassigned = stores.filter(x => !x.regional_manager_id).length

  const months: { label: string; count: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i)
    const yr = d.getFullYear(), mo = d.getMonth()
    months.push({
      label: d.toLocaleDateString('en-ZA', { month: 'short' }),
      count: t.filter(x => {
        const cd = new Date(x.created_at)
        return cd.getFullYear() === yr && cd.getMonth() === mo
      }).length,
    })
  }
  const monthMax = Math.max(...months.map(m => m.count), 1)

  const storeCounts: Record<string, { name: string; count: number }> = {}
  for (const tk of t) {
    const store = stores.find(s => s.id === tk.client_id)
    if (!store) continue
    if (!storeCounts[store.id]) {
      storeCounts[store.id] = { name: `${store.company_name ?? '?'} — ${store.sub_store ?? '?'}`, count: 0 }
    }
    storeCounts[store.id].count++
  }
  const topStores = Object.values(storeCounts).sort((a, b) => b.count - a.count).slice(0, 6)
  const topMax = topStores[0]?.count ?? 1

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart2 size={20} className="text-brand-600" /> Statistics
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Overview of all activity across the platform</p>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Tickets', value: t.length,           icon: ClipboardList, accent: 'border-l-blue-500',   iconCls: 'text-blue-600 dark:text-blue-400'   },
          { label: 'Open Tickets',  value: openTickets,        icon: Wrench,        accent: 'border-l-amber-500',  iconCls: 'text-amber-600 dark:text-amber-400' },
          { label: 'Completed',     value: byStatus.completed, icon: CheckCircle2,  accent: 'border-l-green-500',  iconCls: 'text-green-600 dark:text-green-400' },
          { label: 'Urgent Open',   value: t.filter(x => x.priority === 'urgent' && !['completed','cancelled','declined'].includes(x.status)).length,
                                           icon: ShieldAlert,  accent: 'border-l-red-500',    iconCls: 'text-red-600 dark:text-red-400'     },
        ].map(s => (
          <div key={s.label} className={`bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 border-l-4 ${s.accent} rounded-xl p-4 flex items-center gap-3`}>
            <s.icon size={22} className={`shrink-0 ${s.iconCls}`} />
            <div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Completed vs Open bar */}
      {totalTickets > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-900 dark:text-white">Completed vs Open Tickets</span>
            <span className="text-gray-500 dark:text-gray-400">{byStatus.completed} of {totalTickets} completed</span>
          </div>
          <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all rounded-l-full" style={{ width: `${completionPct}%` }} />
            <div className="h-full bg-blue-500 transition-all" style={{ width: `${openPct}%` }} />
          </div>
          <div className="flex items-center gap-6 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
              {completionPct}% Completed ({byStatus.completed})
            </span>
            <span className="flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
              {openPct}% Open Tickets ({openTickets})
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Ticket status breakdown */}
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <ClipboardList size={14} className="text-brand-600" /> Tickets by Status
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Open',             value: byStatus.open,             color: 'bg-blue-500'    },
              { label: 'Quoted',           value: byStatus.quoted,           color: 'bg-cyan-500'    },
              { label: 'Accepted',         value: byStatus.accepted,         color: 'bg-teal-500'    },
              { label: 'In Progress',      value: byStatus.in_progress,      color: 'bg-amber-500'   },
              { label: 'Pending Sign-off', value: byStatus.pending_sign_off, color: 'bg-orange-500'  },
              { label: 'Snag',             value: byStatus.snag,             color: 'bg-red-500'     },
              { label: 'Completed',        value: byStatus.completed,        color: 'bg-green-500'   },
              { label: 'Declined',         value: byStatus.declined,         color: 'bg-fuchsia-500' },
              { label: 'Cancelled',        value: byStatus.cancelled,        color: 'bg-gray-400'    },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{row.label}</span>
                </div>
                <Bar value={row.value} max={t.length || 1} color={row.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Priority breakdown */}
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <ShieldAlert size={14} className="text-red-500" /> Tickets by Priority
          </h2>
          <div className="space-y-3">
            {[
              { label: 'Urgent', value: byPriority.urgent, color: 'bg-red-500'    },
              { label: 'High',   value: byPriority.high,   color: 'bg-orange-500' },
              { label: 'Medium', value: byPriority.medium, color: 'bg-yellow-500' },
              { label: 'Low',    value: byPriority.low,    color: 'bg-green-500'  },
            ].map(row => (
              <div key={row.label}>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1"><span>{row.label}</span></div>
                <Bar value={row.value} max={t.length || 1} color={row.color} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
            {[
              { label: 'Urgent', value: byPriority.urgent, color: 'text-red-600'    },
              { label: 'High',   value: byPriority.high,   color: 'text-orange-500' },
              { label: 'Medium', value: byPriority.medium, color: 'text-yellow-600' },
              { label: 'Low',    value: byPriority.low,    color: 'text-green-600'  },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-400">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Quote stats */}
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <ReceiptText size={14} className="text-purple-500" /> Quotes
          </h2>
          <div className="flex items-center justify-center mb-4">
            <div className="text-center">
              <DonutRing pct={acceptRate} color="#22c55e" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Acceptance rate</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 text-center">
            <div><p className="text-xl font-bold text-green-600">{qAccepted}</p><p className="text-xs text-gray-400">Accepted</p></div>
            <div><p className="text-xl font-bold text-yellow-600">{qPending}</p><p className="text-xs text-gray-400">Pending</p></div>
            <div><p className="text-xl font-bold text-gray-500">{qDeclined}</p><p className="text-xs text-gray-400">Declined</p></div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-white">{formatCurrency(qValue)}</p>
              <p className="text-xs text-gray-400">Accepted value</p>
            </div>
            <div>
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{formatCurrency(qPendingValue)}</p>
              <p className="text-xs text-gray-400">Pending value</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Monthly ticket volume */}
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-5 flex items-center gap-2">
            <TrendingUp size={14} className="text-brand-600" /> Monthly Ticket Volume
          </h2>
          <div className="flex items-end gap-2 h-32">
            {months.map(m => {
              const heightPct = monthMax > 0 ? (m.count / monthMax) * 100 : 0
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{m.count || ''}</span>
                  <div className="w-full flex items-end" style={{ height: '90px' }}>
                    <div
                      className="w-full rounded-t-md bg-brand-500 dark:bg-brand-600 transition-all"
                      style={{ height: `${Math.max(heightPct, m.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{m.label}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* People & coverage */}
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm flex items-center gap-2">
            <Users size={14} className="text-brand-600" /> People &amp; Coverage
          </h2>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3">
              <p className="text-2xl font-bold text-brand-700 dark:text-brand-400">{rms.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Regional Managers</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stores.length}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Stores</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="text-center border border-gray-100 dark:border-gray-700 rounded-xl p-3">
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {stores.length > 0 ? (t.length / stores.length).toFixed(1) : '0'}
              </p>
              <p className="text-xs text-gray-400">Avg tickets / store</p>
            </div>
            <div className="text-center border border-gray-100 dark:border-gray-700 rounded-xl p-3">
              <p className="text-xl font-bold text-gray-900 dark:text-white">
                {rms.length > 0 ? (stores.length / rms.length).toFixed(1) : '0'}
              </p>
              <p className="text-xs text-gray-400">Avg stores / RM</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top stores */}
      {topStores.length > 0 && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h2 className="font-semibold text-gray-900 dark:text-white text-sm mb-4 flex items-center gap-2">
            <Building2 size={14} className="text-brand-600" /> Top Stores by Ticket Volume
          </h2>
          <div className="space-y-3">
            {topStores.map((s, i) => (
              <div key={s.name}>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    <span className="text-gray-400 mr-1.5">#{i + 1}</span>{s.name}
                  </span>
                </div>
                <Bar value={s.count} max={topMax} color="bg-brand-500" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

