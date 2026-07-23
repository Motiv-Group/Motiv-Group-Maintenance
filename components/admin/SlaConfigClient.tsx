'use client'

// Admin → SLA. The "Motiv SLA" is the platform default (sla_rules with company_id
// NULL) every company inherits. Each company can be given its own override; the
// health engine resolves company row → Motiv row → hardcoded fallback. Values are
// stored in minutes; the editor works in hours (how the business talks about them).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer, Check, Loader2, ChevronDown, RotateCcw, Building2 } from 'lucide-react'
import { Card } from '@/components/exec/ui'

const WINDOWS = [
  { key: 'first_response_mins', label: 'First response', hint: 'Supplier acknowledges the job' },
  { key: 'attendance_mins', label: 'Attendance', hint: 'Supplier arrives on site' },
  { key: 'quote_due_mins', label: 'Quote due', hint: 'Quote submitted after the request' },
  { key: 'resolution_mins', label: 'Resolution', hint: 'The headline fix-by window' },
  { key: 'internal_decision_mins', label: 'Internal decision', hint: 'RM decision (approve / assign / review)' },
] as const
type WindowKey = (typeof WINDOWS)[number]['key']

const PRIORITY_META: Record<string, { label: string; cls: string }> = {
  P1: { label: 'P1 · Urgent', cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
  P2: { label: 'P2 · High', cls: 'bg-orange-500/15 text-orange-600 dark:text-orange-400' },
  P3: { label: 'P3 · Medium', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  P4: { label: 'P4 · Low', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
}

export type SlaRules = Record<'P1' | 'P2' | 'P3' | 'P4', Record<WindowKey, number>>
export type CompanySla = { id: string; name: string; overridden: boolean; rules: SlaRules }

const toHours = (mins: number) => Math.round((mins / 60) * 10) / 10
const toMins = (hours: number) => Math.round(hours * 60)
const PRIORITIES = ['P1', 'P2', 'P3', 'P4'] as const

function valsFrom(rules: SlaRules): Record<string, string> {
  const v: Record<string, string> = {}
  for (const p of PRIORITIES) for (const w of WINDOWS) v[`${p}.${w.key}`] = String(toHours(rules[p][w.key]))
  return v
}

const inputCls = 'w-full rounded-lg bg-[var(--input-bg)] px-2.5 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500/50 sm:py-2'

// One editable SLA target — the Motiv default (companyId null) or a single company.
function SlaEditor({ companyId, initial, motiv, overridden, allowReset }: {
  companyId: string | null
  initial: SlaRules
  motiv: SlaRules
  overridden: boolean
  allowReset: boolean
}) {
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>(() => valsFrom(initial))
  const [saved, setSaved] = useState(vals)
  const [busy, setBusy] = useState<false | 'save' | 'reset'>(false)
  const [done, setDone] = useState('')
  const [err, setErr] = useState('')
  const dirty = JSON.stringify(vals) !== JSON.stringify(saved)

  async function save() {
    setErr(''); setDone('')
    const rules: Record<string, Record<string, number>> = {}
    for (const p of PRIORITIES) {
      rules[p] = {}
      for (const w of WINDOWS) {
        const h = Number(vals[`${p}.${w.key}`])
        if (!Number.isFinite(h) || h <= 0) { setErr(`${PRIORITY_META[p].label} — ${w.label}: enter a positive number of hours.`); return }
        const mins = toMins(h)
        if (mins < 5 || mins > 40320) { setErr(`${PRIORITY_META[p].label} — ${w.label}: between 5 minutes and 4 weeks (672h).`); return }
        rules[p][w.key] = mins
      }
    }
    setBusy('save')
    try {
      const res = await fetch('/api/admin/sla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules, companyId }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
      setSaved({ ...vals }); setDone('Saved — dashboards use the new windows immediately.'); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setBusy(false) }
  }

  async function reset() {
    if (!companyId) return
    setErr(''); setDone('')
    setBusy('reset')
    try {
      const res = await fetch('/api/admin/sla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', companyId }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Reset failed')
      const back = valsFrom(motiv)
      setVals(back); setSaved(back); setDone('Reset — this company now follows the Motiv SLA.'); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Reset failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {PRIORITIES.map(p => (
        <div key={p} className="rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_META[p].cls}`}>{PRIORITY_META[p].label}</span>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {WINDOWS.map(w => (
              <label key={w.key} className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text)]">{w.label}</span>
                <div className="relative">
                  <input
                    type="number" min={0.1} step={0.5} inputMode="decimal"
                    value={vals[`${p}.${w.key}`]}
                    onChange={e => { setVals(v => ({ ...v, [`${p}.${w.key}`]: e.target.value })); setDone('') }}
                    className={`${inputCls} pr-7`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-faint)]">h</span>
                </div>
                <span className="mt-0.5 block text-[10px] leading-tight text-[var(--text-faint)]">{w.hint}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      {err && <p className="text-sm text-red-500">{err}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={save} disabled={busy !== false || !dirty} className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50 sm:h-10">
          {busy === 'save' ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save SLA'}
        </button>
        {allowReset && overridden && (
          <button onClick={reset} disabled={busy !== false} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] disabled:opacity-50 sm:h-10">
            {busy === 'reset' ? <><Loader2 size={15} className="animate-spin" /> Resetting…</> : <><RotateCcw size={14} /> Reset to Motiv SLA</>}
          </button>
        )}
        {done && !dirty && <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><Check size={15} /> {done}</span>}
      </div>
    </div>
  )
}

// One collapsible company row (closed by default — the list can be long).
function CompanyRow({ company, motiv }: { company: CompanySla; motiv: SlaRules }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="overflow-hidden p-0">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left transition hover:bg-[var(--hover)]">
        <Building2 size={16} className="shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text)]">{company.name}</span>
        {company.overridden
          ? <span className="shrink-0 rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">Custom SLA</span>
          : <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-faint)] ring-1 ring-[var(--border)]">Inherits Motiv</span>}
        <ChevronDown size={16} className={`shrink-0 text-[var(--text-faint)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="border-t border-[var(--border)] p-4">
          <SlaEditor companyId={company.id} initial={company.rules} motiv={motiv} overridden={company.overridden} allowReset />
        </div>
      )}
    </Card>
  )
}

export function SlaConfigClient({ motiv, companies }: { motiv: SlaRules; companies: CompanySla[] }) {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
          <Timer size={22} className="text-blue-600 dark:text-blue-400" /> SLA
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          The service-level windows behind every dashboard, health score and overdue flag, per ticket priority. Values are in <b>hours</b>. The <b>Motiv SLA</b> is the platform default; give a company its own override below and it wins over the default for that company only.
        </p>
      </div>

      {/* Motiv (platform default) SLA */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Timer size={16} className="text-blue-600 dark:text-blue-400" />
          <h2 className="text-sm font-bold text-[var(--text)]">Motiv SLA</h2>
          <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">Platform default</span>
        </div>
        <SlaEditor companyId={null} initial={motiv} motiv={motiv} overridden allowReset={false} />
      </Card>

      {/* Per-company overrides */}
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <Building2 size={16} className="text-[var(--text-muted)]" /> Per-company SLA ({companies.length})
        </h2>
        <p className="mb-3 text-xs text-[var(--text-muted)]">Each company follows the Motiv SLA until you set its own. Expand a company to give it custom windows, or reset it back to the Motiv default.</p>
        {companies.length
          ? <div className="space-y-2.5">{companies.map(c => <CompanyRow key={c.id} company={c} motiv={motiv} />)}</div>
          : <p className="text-sm text-[var(--text-faint)]">No active companies yet.</p>}
      </div>
    </div>
  )
}
