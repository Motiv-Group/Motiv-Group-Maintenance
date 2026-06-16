'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, PlusCircle, ChevronDown } from 'lucide-react'
import { Card } from '@/components/exec/ui'

type Mode = 'exec-regions' | 'rm-stores' | 'suppliers'
interface Opt { id: string; name: string }

export function ProvisionPanel({ mode, regions = [], stores = [] }: { mode: Mode; regions?: Opt[]; stores?: Opt[] }) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-0 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-white">
        <span className="flex items-center gap-2"><UserPlus size={15} className="text-[#C6A35D]" /> {title(mode)}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-5 pb-5 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-white/5 pt-4">
          {mode === 'exec-regions' && <>
            <Form action="add_region" title="Add region" fields={[{ k: 'name', ph: 'Region name' }, { k: 'code', ph: 'Code (e.g. GP)' }]} cta={<><PlusCircle size={14} /> Add</>} />
            <Form action="invite_rm" title="Invite regional manager" fields={[{ k: 'email', ph: 'RM email', type: 'email' }]} select={{ k: 'regionId', label: 'Region', opts: regions }} cta={<><UserPlus size={14} /> Invite</>} />
          </>}
          {mode === 'rm-stores' && <>
            <Form action="add_store" title="Add store" fields={[{ k: 'branch_code', ph: 'Branch code' }, { k: 'name', ph: 'Store name' }]} cta={<><PlusCircle size={14} /> Add</>} />
            <Form action="invite_store_manager" title="Invite store manager" fields={[{ k: 'email', ph: 'Manager email', type: 'email' }]} select={{ k: 'storeId', label: 'Store', opts: stores }} cta={<><UserPlus size={14} /> Invite</>} />
          </>}
          {mode === 'suppliers' && (
            <div className="lg:col-span-2"><Form action="add_supplier" title="Add supplier (optionally invite their login)" fields={[{ k: 'companyName', ph: 'Supplier company' }, { k: 'trade', ph: 'Trade (e.g. Electrical)' }, { k: 'email', ph: 'Supplier login email (optional)', type: 'email' }]} cta={<><PlusCircle size={14} /> Add supplier</>} /></div>
          )}
        </div>
      )}
    </Card>
  )
}

function title(m: Mode) { return m === 'exec-regions' ? 'Manage regions & RMs' : m === 'rm-stores' ? 'Manage stores & managers' : 'Add suppliers' }

interface FieldDef { k: string; ph: string; type?: string }
function Form({ action, title, fields, select, cta }: { action: string; title: string; fields: FieldDef[]; select?: { k: string; label: string; opts: Opt[] }; cta: React.ReactNode }) {
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null)
  const input = 'w-full px-3 py-2 rounded-lg bg-[#121826] border border-white/10 text-white text-sm placeholder-slate-500'

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...vals }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setMsg({ ok: true, text: d.actionLink ? (d.emailed ? 'Invited — email sent.' : 'Created. Email not configured — copy the link:') : 'Done.', link: d.emailed ? undefined : d.actionLink })
      setVals({}); router.refresh()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="text-xs text-slate-400">{title}</div>
      {fields.map(f => <input key={f.k} className={input} type={f.type ?? 'text'} placeholder={f.ph} value={vals[f.k] ?? ''} onChange={e => setVals({ ...vals, [f.k]: e.target.value })} />)}
      {select && (
        <select className={input} value={vals[select.k] ?? ''} onChange={e => setVals({ ...vals, [select.k]: e.target.value })}>
          <option value="" className="bg-[#121826]">— {select.label} —</option>
          {select.opts.map(o => <option key={o.id} value={o.id} className="bg-[#121826]">{o.name}</option>)}
        </select>
      )}
      <button disabled={busy} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-sm font-medium disabled:opacity-50">{busy ? '…' : cta}</button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}{msg.link && <a href={msg.link} className="block text-[#C6A35D] underline break-all mt-1">{msg.link}</a>}</p>}
    </form>
  )
}
