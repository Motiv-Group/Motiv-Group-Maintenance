import { STATUS_LABELS } from '@/lib/utils'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Report model (consumed by BOTH the DOCX builder and the PDF/HTML view) ──
export interface ReportFigure {
  caption: string
  /** Chart.js config object rendered by QuickChart. */
  chart: Record<string, unknown>
}
export interface ReportTable {
  caption: string
  columns: string[]
  rows: (string | number)[][]
}
export interface ReportStat { label: string; value: string }
export interface ReportSection {
  heading: string
  narrative?: string        // filled by Groq
  stats?: ReportStat[]
  tables?: ReportTable[]
  figures?: ReportFigure[]
}
export interface ReportModel {
  title: string
  subtitle: string
  preparedFor: string
  periodLabel: string
  generatedAt: string
  executiveSummary?: string // filled by Groq
  sections: ReportSection[]
}

export interface DateRange { fromISO: string; toISO: string; label: string }

// ─── Date range ──────────────────────────────────────────────────────────────
export function resolveRange(period: string, from?: string, to?: string): DateRange {
  const now = new Date()
  const end = to ? new Date(to + 'T23:59:59') : now
  let start: Date
  let label: string

  if (period === 'week') {
    start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0)
    label = 'This Week'
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1)
    label = 'This Month'
  } else {
    start = from ? new Date(from + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1)
    label = 'Custom Range'
  }

  const fmt = (d: Date) => d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' })
  return {
    fromISO: start.toISOString(),
    toISO:   end.toISOString(),
    label:   `${label} (${fmt(start)} – ${fmt(end)})`,
  }
}

// ─── QuickChart ───────────────────────────────────────────────────────────────
const BRAND = ['#9a7b34', '#2563eb', '#059669', '#e11d48', '#7c3aed', '#f59e0b', '#0891b2', '#64748b']

export function chartUrl(config: Record<string, unknown>, w = 640, h = 360): string {
  const c = encodeURIComponent(JSON.stringify(config))
  return `https://quickchart.io/chart?bkg=white&w=${w}&h=${h}&c=${c}`
}

function barChart(title: string, labels: string[], data: number[]): Record<string, unknown> {
  return {
    type: 'bar',
    data: { labels, datasets: [{ label: title, data, backgroundColor: BRAND[0] }] },
    options: { plugins: { legend: { display: false }, title: { display: true, text: title } } },
  }
}
function pieChart(title: string, labels: string[], data: number[]): Record<string, unknown> {
  return {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: BRAND }] },
    options: { plugins: { title: { display: true, text: title } } },
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────────
const zar = (n: number) => 'R ' + (n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : '—'
const statusLabel = (s: string) => (STATUS_LABELS as Record<string, string>)[s] ?? s

type Row = Record<string, any>

// ─── Supplier report ────────────────────────────────────────────────────────
export async function buildSupplierModel(
  admin: SupabaseClient,
  supplierId: string,
  supplierName: string,
  range: DateRange,
): Promise<ReportModel> {
  const [{ data: tickets }, { data: quotes }, { data: completions }, { data: subs }] = await Promise.all([
    admin.from('tickets').select('id, status, priority, created_at, client_id, profiles(company_name, sub_store)')
      .gte('created_at', range.fromISO).lte('created_at', range.toISO),
    admin.from('quotes').select('status, type, amount, amount_incl_vat, created_at')
      .eq('admin_id', supplierId).gte('created_at', range.fromISO).lte('created_at', range.toISO),
    admin.from('completions').select('status, created_at')
      .eq('admin_id', supplierId).gte('created_at', range.fromISO).lte('created_at', range.toISO),
    admin.from('suppliers').select('trade, qualified'),
  ])

  const T = (tickets ?? []) as Row[]
  const Q = (quotes ?? []) as Row[]
  const C = (completions ?? []) as Row[]
  const S = (subs ?? []) as Row[]

  const mainQuotes = Q.filter(q => q.type !== 'variation')
  const variations = Q.filter(q => q.type === 'variation')
  const accepted   = mainQuotes.filter(q => q.status === 'accepted')
  const declined   = mainQuotes.filter(q => q.status === 'declined')
  const pending    = mainQuotes.filter(q => q.status === 'pending')
  const acceptedValue = accepted.reduce((s, q) => s + (q.amount ?? 0), 0)
  const pendingValue  = pending.reduce((s, q) => s + (q.amount ?? 0), 0)
  const avgQuote = mainQuotes.length ? mainQuotes.reduce((s, q) => s + (q.amount ?? 0), 0) / mainQuotes.length : 0

  // tickets by status
  const statusCounts = new Map<string, number>()
  for (const t of T) statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1)
  const statusLabels = Array.from(statusCounts.keys())

  // top clients by ticket count
  const clientCount = new Map<string, number>()
  for (const t of T) {
    const name = t.profiles?.company_name ?? 'Unknown'
    clientCount.set(name, (clientCount.get(name) ?? 0) + 1)
  }
  const topClients = Array.from(clientCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)

  // sub-suppliers by trade
  const tradeCount = new Map<string, number>()
  for (const s of S) {
    const k = s.trade?.trim() || 'Other'
    tradeCount.set(k, (tradeCount.get(k) ?? 0) + 1)
  }

  const snags = T.filter(t => t.status === 'snag' || t.status === 'snag_in_progress').length

  return {
    title: 'Supplier Performance Report',
    subtitle: 'Maintenance ticketing, quoting & delivery summary',
    preparedFor: supplierName,
    periodLabel: range.label,
    generatedAt: new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
    sections: [
      {
        heading: 'Overview',
        stats: [
          { label: 'Tickets in period',   value: String(T.length) },
          { label: 'Quotes submitted',    value: String(mainQuotes.length) },
          { label: 'Quote acceptance',    value: pct(accepted.length, accepted.length + declined.length) },
          { label: 'Accepted value',      value: zar(acceptedValue) },
          { label: 'Pending value',       value: zar(pendingValue) },
          { label: 'Variation orders',    value: String(variations.length) },
        ],
      },
      {
        heading: 'Tickets by Status',
        figures: statusLabels.length ? [{
          caption: 'Tickets by status',
          chart: pieChart('Tickets by status', statusLabels.map(statusLabel), statusLabels.map(s => statusCounts.get(s)!)),
        }] : [],
        tables: [{
          caption: 'Ticket status breakdown',
          columns: ['Status', 'Count'],
          rows: statusLabels.map(s => [statusLabel(s), statusCounts.get(s)!]),
        }],
      },
      {
        heading: 'Quoting & Financials',
        figures: [{
          caption: 'Quote outcomes',
          chart: barChart('Quote outcomes', ['Accepted', 'Declined', 'Pending'], [accepted.length, declined.length, pending.length]),
        }],
        tables: [{
          caption: 'Quote & financial summary',
          columns: ['Metric', 'Value'],
          rows: [
            ['Quotes submitted', mainQuotes.length],
            ['Accepted', accepted.length],
            ['Declined', declined.length],
            ['Pending', pending.length],
            ['Acceptance rate', pct(accepted.length, accepted.length + declined.length)],
            ['Average quote (excl VAT)', zar(avgQuote)],
            ['Accepted value (excl VAT)', zar(acceptedValue)],
            ['Pending value (excl VAT)', zar(pendingValue)],
            ['Variation orders raised', variations.length],
          ],
        }],
      },
      {
        heading: 'Delivery & Sign-off',
        tables: [{
          caption: 'Completion & snag summary',
          columns: ['Metric', 'Value'],
          rows: [
            ['Completions submitted', C.length],
            ['Approved', C.filter(c => c.status === 'approved').length],
            ['Rejected', C.filter(c => c.status === 'rejected').length],
            ['Tickets currently in snag', snags],
          ],
        }],
      },
      {
        heading: 'Top Clients',
        tables: [{
          caption: 'Most active clients (by ticket volume)',
          columns: ['Client', 'Tickets'],
          rows: topClients.length ? topClients : [['No tickets in period', 0]],
        }],
      },
      {
        heading: 'Sub-Suppliers',
        figures: tradeCount.size ? [{
          caption: 'Sub-suppliers by trade',
          chart: barChart('Sub-suppliers by trade', Array.from(tradeCount.keys()), Array.from(tradeCount.values())),
        }] : [],
        tables: [{
          caption: 'Sub-supplier directory summary',
          columns: ['Trade', 'Count'],
          rows: Array.from(tradeCount.entries()),
        }],
      },
    ],
  }
}

// ─── Regional Manager report ────────────────────────────────────────────────
export async function buildRegionalModel(
  admin: SupabaseClient,
  rmName: string,
  storeIds: string[],
  storeMap: Record<string, { company_name?: string; sub_store?: string }>,
  range: DateRange,
): Promise<ReportModel> {
  const { data: tickets } = storeIds.length
    ? await admin.from('tickets').select('id, status, client_id, created_at, quotes(status, type, amount)')
        .in('client_id', storeIds).gte('created_at', range.fromISO).lte('created_at', range.toISO)
    : { data: [] }

  const T = (tickets ?? []) as Row[]
  const allQuotes = T.flatMap(t => (t.quotes ?? []) as Row[])
  const pendingQuotes     = allQuotes.filter(q => q.status === 'pending' && q.type !== 'variation').length
  const pendingVariations = allQuotes.filter(q => q.status === 'pending' && q.type === 'variation').length
  const acceptedSpend     = allQuotes.filter(q => q.status === 'accepted').reduce((s, q) => s + (q.amount ?? 0), 0)

  const storeName = (id: string) => {
    const s = storeMap[id]
    return s ? `${s.company_name ?? '—'}${s.sub_store ? ' — ' + s.sub_store : ''}` : 'Unknown'
  }

  // per-store breakdown
  const perStore = storeIds.map(id => {
    const ts = T.filter(t => t.client_id === id)
    const qs = ts.flatMap(t => (t.quotes ?? []) as Row[])
    return {
      name:        storeName(id),
      total:       ts.length,
      completed:   ts.filter(t => t.status === 'completed').length,
      inProgress:  ts.filter(t => ['in_progress', 'variation_pending', 'snag_in_progress'].includes(t.status)).length,
      pendingAppr: qs.filter(q => q.status === 'pending').length,
      spend:       qs.filter(q => q.status === 'accepted').reduce((s, q) => s + (q.amount ?? 0), 0),
    }
  })

  const statusCounts = new Map<string, number>()
  for (const t of T) statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1)
  const statusLabels = Array.from(statusCounts.keys())

  const completed = T.filter(t => t.status === 'completed').length
  const snags     = T.filter(t => t.status === 'snag' || t.status === 'snag_in_progress').length

  return {
    title: 'Regional Performance Report',
    subtitle: 'Multi-store maintenance overview',
    preparedFor: rmName,
    periodLabel: range.label,
    generatedAt: new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }),
    sections: [
      {
        heading: 'Overview',
        stats: [
          { label: 'Stores in report', value: String(storeIds.length) },
          { label: 'Tickets in period', value: String(T.length) },
          { label: 'Completed', value: pct(completed, T.length) },
          { label: 'Quotes pending approval', value: String(pendingQuotes) },
          { label: 'Variations pending', value: String(pendingVariations) },
          { label: 'Accepted spend', value: zar(acceptedSpend) },
        ],
      },
      {
        heading: 'Tickets by Status',
        figures: statusLabels.length ? [{
          caption: 'Tickets by status (all selected stores)',
          chart: pieChart('Tickets by status', statusLabels.map(statusLabel), statusLabels.map(s => statusCounts.get(s)!)),
        }] : [],
        tables: [{
          caption: 'Ticket status breakdown',
          columns: ['Status', 'Count'],
          rows: statusLabels.map(s => [statusLabel(s), statusCounts.get(s)!]),
        }],
      },
      {
        heading: 'Store Comparison',
        figures: perStore.length ? [{
          caption: 'Tickets per store',
          chart: barChart('Tickets per store', perStore.map(s => s.name), perStore.map(s => s.total)),
        }] : [],
        tables: [{
          caption: 'Per-store performance',
          columns: ['Store', 'Tickets', 'Completed', 'In progress', 'Pending approvals', 'Accepted spend'],
          rows: perStore.length
            ? perStore.map(s => [s.name, s.total, s.completed, s.inProgress, s.pendingAppr, zar(s.spend)])
            : [['No stores selected', 0, 0, 0, 0, zar(0)]],
        }],
      },
      {
        heading: 'Approvals & Spend',
        tables: [{
          caption: 'Approval workload & financials',
          columns: ['Metric', 'Value'],
          rows: [
            ['Quotes pending approval', pendingQuotes],
            ['Variation orders pending', pendingVariations],
            ['Accepted spend (excl VAT)', zar(acceptedSpend)],
            ['Tickets in snag', snags],
          ],
        }],
      },
    ],
  }
}
