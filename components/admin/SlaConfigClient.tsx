'use client'

// Admin → SLA. Edits the PLATFORM-GLOBAL sla_rules (company_id NULL) that the
// health engine falls back to for every company without its own override.
// Values are stored in minutes; the editor works in hours (1 decimal) because
// that's how the business talks about the windows.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer, Check, Loader2 } from 'lucide-react'
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

const toHours = (mins: number) => Math.round((mins / 60) * 10) / 10
const toMins = (hours: number) => Math.round(hours * 60)

export function SlaConfigClient({ initial }: { initial: SlaRules }) {
  const router = useRouter()
  // Edited state in HOURS strings (free typing); parsed on save.
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {}
    for (const p of ['P1', 'P2', 'P3', 'P4'] as const) for (const w of WINDOWS) v[`${p}.${w.key}`] = String(toHours(initial[p][w.key]))
    return v
  })
  const [saved, setSaved] = useState(vals)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const dirty = JSON.stringify(vals) !== JSON.stringify(saved)

  async function save() {
    setErr(''); setDone(false)
    const rules: Record<string, Record<string, number>> = {}
    for (const p of ['P1', 'P2', 'P3', 'P4'] as const) {
      rules[p] = {}
      for (const w of WINDOWS) {
        const h = Number(vals[`${p}.${w.key}`])
        if (!Number.isFinite(h) || h <= 0) { setErr(`${PRIORITY_META[p].label} — ${w.label}: enter a positive number of hours.`); return }
        const mins = toMins(h)
        if (mins < 5 || mins > 40320) { setErr(`${PRIORITY_META[p].label} — ${w.label}: between 5 minutes and 4 weeks (672h).`); return }
        rules[p][w.key] = mins
      }
    }
    setBusy(true)
    try {
      const res = await fetch('/api/admin/sla', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
      setSaved({ ...vals }); setDone(true); router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed') }
    finally { setBusy(false) }
  }

  const input = 'w-full rounded-lg bg-[var(--input-bg)] px-2.5 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500/50 sm:py-2'

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
          <Timer size={22} className="text-blue-600 dark:text-blue-400" /> SLA
        </h1>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          The service-level windows behind every dashboard, health score and overdue flag, per ticket priority. Values are in <b>hours</b>. These are the platform defaults — a company-specific override (set in the database) wins over them.
        </p>
      </div>

      {(['P1', 'P2', 'P3', 'P4'] as const).map(p => (
        <Card key={p} className="p-4">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_META[p].cls}`}>{PRIORITY_META[p].label}</span>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {WINDOWS.map(w => (
              <label key={w.key} className="block">
                <span className="mb-1 block text-xs font-semibold text-[var(--text)]">{w.label}</span>
                <div className="relative">
                  <input
                    type="number" min={0.1} step={0.5} inputMode="decimal"
                    value={vals[`${p}.${w.key}`]}
                    onChange={e => { setVals(v => ({ ...v, [`${p}.${w.key}`]: e.target.value })); setDone(false) }}
                    className={`${input} pr-7`}
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-[var(--text-faint)]">h</span>
                </div>
                <span className="mt-0.5 block text-[10px] leading-tight text-[var(--text-faint)]">{w.hint}</span>
              </label>
            ))}
          </div>
        </Card>
      ))}

      {err && <p className="text-sm text-red-500">{err}</p>}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy || !dirty} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
          {busy ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : 'Save SLA rules'}
        </button>
        {done && !dirty && <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><Check size={15} /> Saved — dashboards use the new windows immediately.</span>}
      </div>
    </div>
  )
}
