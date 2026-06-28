'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, PlusCircle, ChevronDown } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { Drawer, DrawerHeader } from '@/components/exec/Drawer'

type Mode = 'exec-regions' | 'rm-stores' | 'suppliers'
interface Opt { id: string; name: string }
interface Props { mode: Mode; regions?: Opt[]; stores?: Opt[] }

function title(m: Mode) { return m === 'exec-regions' ? 'Manage regions & RMs' : m === 'rm-stores' ? 'Manage stores & managers' : 'Add suppliers' }

/** The provision forms for a given mode (shared by the inline panel + the button). */
export function ProvisionForms({ mode, regions = [], stores = [] }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {mode === 'exec-regions' && <>
        <Form action="add_region" title="Add region" fields={[{ k: 'name', ph: 'Region name' }, { k: 'code', ph: 'Code (e.g. GP)' }]} cta={<><PlusCircle size={14} /> Add</>} />
        <Form action="invite_rm" title="Invite regional manager" fields={[{ k: 'email', ph: 'RM email', type: 'email' }]} select={{ k: 'regionId', label: 'Region', opts: regions }} cta={<><UserPlus size={14} /> Invite</>} />
      </>}
      {mode === 'rm-stores' && <>
        <Form action="add_store" title="Add store only" fields={[{ k: 'branch_code', ph: 'Branch code' }, { k: 'name', ph: 'Store name' }]} cta={<><PlusCircle size={14} /> Add store</>} />
        <Form action="create_store_manager" title="Create store + manager account"
          fields={[
            { k: 'branch_code', ph: 'Branch code' },
            { k: 'store_name', ph: 'Store / branch name' },
            { k: 'full_name', ph: 'Manager full name' },
            { k: 'email', ph: 'Manager email', type: 'email' },
            { k: 'password', ph: 'Temporary password (min 8)', type: 'password' },
            { k: 'phone', ph: 'Manager phone (optional)' },
          ]}
          cta={<><UserPlus size={14} /> Create account</>} />
      </>}
      {mode === 'suppliers' && (
        <div className="lg:col-span-2"><Form action="add_supplier" title="Add supplier (optionally invite their login)" fields={[{ k: 'companyName', ph: 'e.g. ABC Electrical', label: 'Supplier company' }, { k: 'trade', ph: 'e.g. Electrical', label: 'Trade' }, { k: 'email', ph: 'supplier@company.co.za', type: 'email', label: 'Login email (optional)' }]} cta={<><PlusCircle size={14} /> Add supplier</>} /></div>
      )}
    </div>
  )
}

/** Collapsible inline card (kept for the RM stores page). */
export function ProvisionPanel({ mode, regions = [], stores = [] }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <Card className="p-0 overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-3 text-sm font-semibold text-[var(--text)]">
        <span className="flex items-center gap-2"><UserPlus size={15} className="text-[#C6A35D]" /> {title(mode)}</span>
        <ChevronDown size={16} className={`text-[var(--text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-5 pb-5 border-t border-[var(--border)] pt-4"><ProvisionForms mode={mode} regions={regions} stores={stores} /></div>}
    </Card>
  )
}

/** Top-right button that opens the provision forms in a slide-over. */
export function ProvisionButton({ mode, regions = [], stores = [], label, tone = 'gold' }: Props & { label?: string; tone?: 'gold' | 'green' }) {
  const [open, setOpen] = useState(false)
  const btn = tone === 'green'
    ? 'text-white bg-emerald-600 hover:bg-emerald-500'
    : 'text-[#0a0e17] bg-[#C6A35D] hover:brightness-95'
  return (
    <>
      <button onClick={() => setOpen(true)} className={`flex items-center gap-2 text-sm font-semibold rounded-xl px-3.5 py-2 transition ${btn}`}>
        <UserPlus size={14} /> {label ?? title(mode)}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)}>
        <DrawerHeader onClose={() => setOpen(false)} title={<h3 className="text-lg font-bold text-[var(--text)]">{title(mode)}</h3>} />
        <ProvisionForms mode={mode} regions={regions} stores={stores} />
      </Drawer>
    </>
  )
}

interface FieldDef { k: string; ph: string; type?: string; label?: string }
function Form({ action, title, fields, select, cta }: { action: string; title: string; fields: FieldDef[]; select?: { k: string; label: string; opts: Opt[] }; cta: React.ReactNode }) {
  const router = useRouter()
  const [vals, setVals] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null)
  const input = 'w-full px-3 py-2 rounded-lg bg-[var(--input-bg)] border border-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)]'

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/provision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...vals }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ?? 'Failed')
      setMsg({ ok: true, text: d.message ?? (d.actionLink ? (d.emailed ? 'Invited — email sent.' : 'Created. Email not configured — copy the link:') : 'Done.'), link: d.emailed ? undefined : d.actionLink })
      setVals({}); router.refresh()
    } catch (e: any) { setMsg({ ok: false, text: e.message }) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="text-xs text-[var(--text-muted)]">{title}</div>
      {fields.map(f => (
        <div key={f.k}>
          {f.label && <label className="block text-xs font-medium text-[var(--text-muted)] mb-1">{f.label}</label>}
          <input className={input} type={f.type ?? 'text'} placeholder={f.ph} value={vals[f.k] ?? ''} onChange={e => setVals({ ...vals, [f.k]: e.target.value })} />
        </div>
      ))}
      {select && (
        <select className={input} value={vals[select.k] ?? ''} onChange={e => setVals({ ...vals, [select.k]: e.target.value })}>
          <option value="" className="bg-[var(--input-bg)]">— {select.label} —</option>
          {select.opts.map(o => <option key={o.id} value={o.id} className="bg-[var(--input-bg)]">{o.name}</option>)}
        </select>
      )}
      <button disabled={busy} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C6A35D] text-[#0a0e17] text-sm font-medium disabled:opacity-50">{busy ? '…' : cta}</button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}{msg.link && <a href={msg.link} className="block text-[#C6A35D] underline break-all mt-1">{msg.link}</a>}</p>}
    </form>
  )
}
