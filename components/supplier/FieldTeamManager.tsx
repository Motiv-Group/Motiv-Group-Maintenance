'use client'

// Supplier "Field Team" page — the technician roster with live per-member job
// stats (active / completed / current job) plus add / edit / remove. Stats are
// derived from real tickets (tickets.technician_id); anything the schema doesn't
// store (ratings, skills, live GPS) is intentionally omitted rather than faked.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Plus, Phone, Pencil, Trash2, X, Check, Wrench, CheckCircle2, CalendarClock, Briefcase, Search } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { isValidPhone } from '@/lib/csv'
import { formatDateTime } from '@/lib/utils'

export interface FieldTeamMember {
  id: string
  name: string
  phone: string
  activeJobs: number
  completedJobs: number
  totalJobs: number
  currentJob: { title: string; jobRef: string | null; scheduledAt: string | null } | null
}

const input = 'w-full px-3 py-2.5 rounded-xl bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm placeholder-[var(--text-faint)] outline-none focus:ring-2 focus:ring-blue-500/40'

// Deterministic monogram tint so a member keeps the same avatar colour.
const AVATAR_TINTS = [
  'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-teal-500/15 text-teal-700 dark:text-teal-300',
]
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.length ? parts.slice(0, 2).map(p => p[0]!.toUpperCase()).join('') : '?'
}
function tintFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_TINTS[h % AVATAR_TINTS.length]
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums text-[var(--text)] leading-none">{value}</div>
        <div className="mt-1 text-xs font-medium text-[var(--text-muted)] truncate">{label}</div>
      </div>
    </Card>
  )
}

export function FieldTeamManager({ members }: { members: FieldTeamMember[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const stats = useMemo(() => ({
    size: members.length,
    onJob: members.filter(m => m.activeJobs > 0).length,
    active: members.reduce((s, m) => s + m.activeJobs, 0),
    completed: members.reduce((s, m) => s + m.completedJobs, 0),
  }), [members])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? members.filter(m => `${m.name} ${m.phone}`.toLowerCase().includes(term)) : members
  }, [members, q])

  async function create() {
    if (!name.trim() || !phone.trim()) { setErr('Name and phone are both required.'); return }
    if (!isValidPhone(phone)) { setErr('Please enter a valid phone number.'); return }
    setBusy(true); setErr('')
    const res = await fetch('/api/supplier/technicians', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) })
    setBusy(false)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not add member'); return }
    setName(''); setPhone(''); setAdding(false); router.refresh()
  }

  async function remove(id: string) {
    if (!confirm('Remove this team member? They will no longer be assignable to jobs.')) return
    const res = await fetch(`/api/supplier/technicians/${id}`, { method: 'DELETE' })
    if (res.ok) router.refresh()
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]"><Users className="text-teal-600 dark:text-teal-400" size={22} /> Field Team</h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">Your technicians on the ground. Assign one when scheduling a job.</p>
        </div>
        {!adding && (
          <button onClick={() => { setAdding(true); setErr('') }} className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"><Plus size={16} /> Add member</button>
        )}
      </div>

      {/* Live team KPIs (all derived from assigned tickets) */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Users size={20} className="text-blue-600 dark:text-blue-400" />} label="Team members" value={stats.size} tone="bg-blue-500/15" />
        <Kpi icon={<Briefcase size={20} className="text-amber-600 dark:text-amber-400" />} label="On a job now" value={stats.onJob} tone="bg-amber-500/15" />
        <Kpi icon={<Wrench size={20} className="text-violet-600 dark:text-violet-400" />} label="Active jobs" value={stats.active} tone="bg-violet-500/15" />
        <Kpi icon={<CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" />} label="Jobs completed" value={stats.completed} tone="bg-emerald-500/15" />
      </div>

      {adding && (
        <Card className="space-y-3 p-4">
          <p className="text-sm font-semibold text-[var(--text)]">New team member</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input autoFocus className={input} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            <input className={input} type="tel" inputMode="tel" placeholder="Phone (e.g. +27 82 123 4567)" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex gap-2">
            <button onClick={create} disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save member'}</button>
            <button onClick={() => { setAdding(false); setErr('') }} className="rounded-lg px-4 py-2 text-sm text-[var(--text-muted)] ring-1 ring-[var(--border)]">Cancel</button>
          </div>
        </Card>
      )}

      {/* Search — only when the roster is large enough to warrant it. */}
      {members.length > 6 && (
        <div className="relative max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search team…" className={`${input} pl-9`} />
        </div>
      )}

      {members.length === 0 ? (
        <Card className="p-8 sm:p-10 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--surface-2)] text-[var(--text-faint)]"><Users size={22} /></span>
          <p className="mt-3 text-sm font-medium text-[var(--text)]">No team members yet</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Add your first technician to start assigning jobs.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(m => (
            <MemberCard key={m.id} member={m} tint={tintFor(m.id)} editing={editId === m.id} onEdit={() => setEditId(m.id)} onCancel={() => setEditId(null)} onSaved={() => { setEditId(null); router.refresh() }} onRemove={() => remove(m.id)} />
          ))}
          {!shown.length && <p className="col-span-full py-8 text-center text-sm text-[var(--text-faint)]">No members match “{q}”.</p>}
        </div>
      )}
    </div>
  )
}

function StatChip({ icon, label, value, cls }: { icon: React.ReactNode; label: string; value: number; cls: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-2.5 py-1.5">
      <span className={cls}>{icon}</span>
      <span className="text-sm font-bold tabular-nums text-[var(--text)]">{value}</span>
      <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
    </div>
  )
}

function MemberCard({ member: m, tint, editing, onEdit, onCancel, onSaved, onRemove }: {
  member: FieldTeamMember; tint: string; editing: boolean; onEdit: () => void; onCancel: () => void; onSaved: () => void; onRemove: () => void
}) {
  const [name, setName] = useState(m.name)
  const [phone, setPhone] = useState(m.phone)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    if (!name.trim() || !phone.trim()) { setErr('Name and phone required.'); return }
    if (!isValidPhone(phone)) { setErr('Please enter a valid phone number.'); return }
    setBusy(true); setErr('')
    const res = await fetch(`/api/supplier/technicians/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone }) })
    setBusy(false)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'Could not save'); return }
    onSaved()
  }

  if (editing) {
    return (
      <Card className="space-y-2.5 p-4">
        <p className="text-sm font-semibold text-[var(--text)]">Edit member</p>
        <input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Full name" />
        <input className={input} type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" />
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"><Check size={13} /> {busy ? 'Saving…' : 'Save'}</button>
          <button onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-[var(--text-muted)] ring-1 ring-[var(--border)]"><X size={13} /> Cancel</button>
        </div>
      </Card>
    )
  }

  const onJob = m.activeJobs > 0
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold ${tint}`}>{initials(m.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold text-[var(--text)]">{m.name}</p>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${onJob ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'}`}>{onJob ? 'On a job' : 'Available'}</span>
          </div>
          <a href={`tel:${m.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-xs text-[var(--text-muted)] transition hover:text-blue-600 dark:hover:text-blue-400"><Phone size={11} /> {m.phone}</a>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={onEdit} title="Edit" className="rounded-lg p-2.5 sm:p-1.5 text-[var(--text-faint)] transition hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400"><Pencil size={15} /></button>
          <button onClick={onRemove} title="Remove" className="rounded-lg p-2.5 sm:p-1.5 text-[var(--text-faint)] transition hover:bg-red-500/10 hover:text-red-500"><Trash2 size={15} /></button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <StatChip icon={<Wrench size={13} />} label="active" value={m.activeJobs} cls="text-violet-600 dark:text-violet-400" />
        <StatChip icon={<CheckCircle2 size={13} />} label="done" value={m.completedJobs} cls="text-emerald-600 dark:text-emerald-400" />
      </div>

      {m.currentJob ? (
        <div className="flex items-start gap-2 rounded-lg bg-blue-500/5 px-3 py-2 ring-1 ring-blue-500/15">
          <Briefcase size={14} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-[var(--text)]">{m.currentJob.jobRef ? `${m.currentJob.jobRef} · ` : ''}{m.currentJob.title}</p>
            {m.currentJob.scheduledAt && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-muted)]"><CalendarClock size={11} /> {formatDateTime(m.currentJob.scheduledAt)}</p>}
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-[var(--text-faint)]">No active job assigned.</p>
      )}
    </Card>
  )
}
