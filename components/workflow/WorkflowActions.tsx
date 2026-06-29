'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { transitionsFor, type WorkflowRole, type Transition } from '@/lib/workflow'

interface FieldDef { k: string; label: string; type?: string; required?: boolean }

// Actions that need extra input before firing.
const FIELDS: Record<string, FieldDef[]> = {
  submit_quote:     [{ k: 'amount', label: 'Quote amount (R)', type: 'number', required: true }, { k: 'description', label: 'Notes' }],
  submit_variation: [{ k: 'description', label: 'What changed / extra scope', required: true }, { k: 'amount', label: 'Extra cost (R)', type: 'number' }],
  raise_snag:       [{ k: 'description', label: 'Snag detail', required: true }],
  schedule:         [{ k: 'scheduledAt', label: 'Scheduled date/time', type: 'datetime-local', required: true }],
  request_info:     [{ k: 'reason', label: 'What info is needed' }],
  request_evidence: [{ k: 'reason', label: 'What evidence is needed' }],
  reject_variation: [{ k: 'reason', label: 'Reason for rejection' }],
}
// Actions where a supplier must be chosen/assigned.
const NEEDS_SUPPLIER = new Set(['validate', 'request_quote', 'require_assessment', 'assign_snag'])
// Actions that get an explicit "Are you sure?" confirmation before firing.
const CONFIRM_ACTIONS = new Set(['raise_snag', 'submit_variation'])
// Pre-defined reasons (+ free-text "Other") for the reason/detail field.
const REASON_PRESETS: Record<string, string[]> = {
  raise_snag:       ['Work incomplete', 'Quality below standard', 'Wrong materials or spec', 'Safety concern', 'Other'],
  request_info:     ['Need more detail', 'Photos unclear', 'Scope unclear', 'Access details needed', 'Other'],
  request_evidence: ['Before photos missing', 'After photos missing', 'COC missing', 'Photos unclear', 'Other'],
}
// Which field the preset fills for each action.
const REASON_KEY: Record<string, string> = { raise_snag: 'description', request_info: 'reason', request_evidence: 'reason' }

function tone(action: string): string {
  if (/^(approve|close_out|proceed|approve_quote|approve_variation|start_work|schedule)/.test(action))
    return 'bg-[#C6A35D] text-[#0a0e17] hover:brightness-95'
  if (/^request_evidence/.test(action))
    return 'bg-amber-500 text-[#0a0e17] hover:bg-amber-600'
  if (/^(reject|reject_quote|reject_variation|raise_snag)/.test(action))
    return 'bg-red-600 text-white hover:bg-red-500'
  return 'ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)]'
}

interface Props {
  ticketId: string
  status: string
  role: WorkflowRole
  /** Suppliers to choose from for assignment actions. */
  suppliers?: { id: string; name: string }[]
  /** Action verbs to hide here (handled by dedicated UI elsewhere). */
  exclude?: string[]
}

export function WorkflowActions({ ticketId, status, role, suppliers = [], exclude = [] }: Props) {
  const router = useRouter()
  const actions = transitionsFor(status, role).filter(t => !exclude.includes(t.action))
  const [active, setActive] = useState<Transition | null>(null)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<{ t: Transition; payload: Record<string, unknown> } | null>(null)
  const [preset, setPreset] = useState('')

  if (actions.length === 0) return null

  const fields = active ? (FIELDS[active.action] ?? []) : []
  const needsSupplier = active ? NEEDS_SUPPLIER.has(active.action) : false
  const presets = active ? REASON_PRESETS[active.action] : undefined
  const reasonKey = active ? REASON_KEY[active.action] : undefined
  const otherChosen = preset === 'Other'

  // Actions that get an explicit "Are you sure?" step before firing.
  function maybeFire(t: Transition, payload: Record<string, unknown>) {
    if (CONFIRM_ACTIONS.has(t.action)) { setActive(null); setConfirm({ t, payload }) }
    else fire(t, payload)
  }

  function start(t: Transition) {
    setError(''); setPreset('')
    if ((FIELDS[t.action] ?? []).length || NEEDS_SUPPLIER.has(t.action)) { setActive(t); setVals({}) }
    else maybeFire(t, {})
  }

  async function fire(t: Transition, payload: Record<string, unknown>) {
    setBusy(true); setError('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}/transition`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: t.action, ...payload }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setActive(null); setVals({}); router.refresh()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  function submitForm(e: React.FormEvent) {
    e.preventDefault()
    if (!active) return
    if (presets) {
      if (!preset) { setError('Choose a reason'); return }
      if (otherChosen && !vals[reasonKey!]?.trim()) { setError('Enter a reason'); return }
    }
    for (const f of fields) {
      if (presets && f.k === reasonKey) continue   // satisfied by the preset above
      if (f.required && !vals[f.k]?.trim()) { setError(`${f.label} is required`); return }
    }
    if (needsSupplier && !vals.supplierId) { setError('Choose a supplier'); return }
    const payload = presets && !otherChosen ? { ...vals, [reasonKey!]: preset } : vals
    maybeFire(active, payload)
  }

  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {actions.map(t => (
          <button key={t.action} onClick={() => start(t)} disabled={busy}
            className={`flex-1 min-w-[8rem] text-center px-3 py-2 rounded-xl text-sm font-medium transition disabled:opacity-50 ${tone(t.action)} ${active?.action === t.action ? 'ring-2 ring-[#C6A35D]' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {active && (fields.length > 0 || needsSupplier) && (
        <form onSubmit={submitForm} className="space-y-2 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3">
          <div className="text-xs text-[var(--text-muted)]">{active.label}</div>
          {needsSupplier && (
            <select className={input} value={vals.supplierId ?? ''} onChange={e => setVals({ ...vals, supplierId: e.target.value })}>
              <option value="">— Choose supplier —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {presets && (
            <select className={input} value={preset} onChange={e => setPreset(e.target.value)}>
              <option value="">— Choose a reason —</option>
              {presets.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          {fields.map(f => {
            if (presets && f.k === reasonKey && !otherChosen) return null   // preset fills it
            return (
              <input key={f.k} className={input} type={f.type ?? 'text'} placeholder={presets && f.k === reasonKey ? 'Type the reason…' : f.label}
                value={vals[f.k] ?? ''} onChange={e => setVals({ ...vals, [f.k]: e.target.value })} />
            )
          })}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-50">{busy ? '…' : 'Confirm'}</button>
            <button type="button" onClick={() => { setActive(null); setError('') }} className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Cancel</button>
          </div>
        </form>
      )}

      {confirm && (
        <div className="rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] p-3 space-y-2">
          <p className="text-sm text-[var(--text)]">Are you sure you want to <span className="font-semibold">{confirm.t.label.toLowerCase()}</span>?</p>
          <div className="flex gap-2">
            <button onClick={() => { const c = confirm; setConfirm(null); fire(c.t, c.payload) }} disabled={busy} className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-500 disabled:opacity-50">{busy ? '…' : 'Yes, continue'}</button>
            <button onClick={() => setConfirm(null)} className="flex-1 min-w-[7rem] px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-500">Cancel</button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
