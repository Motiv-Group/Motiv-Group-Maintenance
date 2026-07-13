'use client'

// Themed date + time picker for scheduling a job. Disables: past dates/times,
// Sundays, dates beyond the ticket-priority window, and non-operating hours
// (Mon–Sat 06:00–22:00). A "custom date & time" escape hatch lets the supplier
// propose a slot outside the suggested window (sent to the RM to accept). No
// external dependency.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, CalendarClock, Info, Star, ArrowLeft, Lock } from 'lucide-react'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WINDOW_H: Record<string, number> = { P1: 8, P2: 24, P3: 72, P4: 168 }
const P_LABEL: Record<string, string> = { P1: 'Urgent', P2: 'High', P3: 'Medium', P4: 'Low' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
// Monday-first column index (Mon=0 … Sun=6)
const colOf = (d: Date) => (d.getDay() + 6) % 7
const pad = (n: number) => String(n).padStart(2, '0')
type Slot = { h: number; m: number }
const fmtSlot = (s: Slot) => `${pad(s.h)}:${pad(s.m)}`
// Urgent tickets get finer 30-min slots; everything else is hourly. 06:00–22:00.
function buildSlots(priority: string): Slot[] {
  const step = priority === 'P1' ? 30 : 60
  const out: Slot[] = []
  for (let mins = 6 * 60; mins <= 22 * 60; mins += step) out.push({ h: Math.floor(mins / 60), m: mins % 60 })
  return out
}
// `datetime-local` value (SA local) for the min attr / parsing — keeps the custom
// picker on Africa/Johannesburg regardless of the device clock.
const pad2 = (n: number) => String(n).padStart(2, '0')
function toLocalInput(d: Date): string {
  const sa = new Date(d.getTime() + 120 * 60_000) // shift to SA wall-clock via UTC fields
  return `${sa.getUTCFullYear()}-${pad2(sa.getUTCMonth() + 1)}-${pad2(sa.getUTCDate())}T${pad2(sa.getUTCHours())}:${pad2(sa.getUTCMinutes())}`
}
function fromLocalInput(v: string): Date {
  // Interpret the entered wall-clock time as SA local (UTC+2).
  const [date, time] = v.split('T')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(Date.UTC(y, mo - 1, d, h, mi) - 120 * 60_000)
}

export function SchedulePicker({ priority, createdAt, onConfirm, onCancel, busy }: {
  priority: string; createdAt: string
  onConfirm: (iso: string) => void; onCancel: () => void; busy: boolean
}) {
  const now = new Date()
  const winH = WINDOW_H[priority] ?? 72
  let max = new Date(new Date(createdAt).getTime() + winH * 3600_000)
  if (max <= now) max = new Date(now.getTime() + winH * 3600_000) // window already passed → from now
  const minDay = startOfDay(now)
  const maxDay = startOfDay(max)
  const SLOTS = useMemo(() => buildSlots(priority), [priority])

  const dayDisabled = (d: Date) => {
    const sd = startOfDay(d)
    return sd < minDay || sd > maxDay || d.getDay() === 0 // no Sundays
  }
  const slotInPast = (d: Date, s: Slot) => { const dt = new Date(d); dt.setHours(s.h, s.m, 0, 0); return dt < now }

  // Earliest valid day+slot in the window — pre-selected as the suggestion so a
  // tight (esp. urgent) deadline still defaults to something the supplier can hit.
  const suggested = useMemo(() => {
    for (let d = new Date(minDay); d <= maxDay; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0) continue
      const day = new Date(d)
      const s = SLOTS.find(sl => !slotInPast(day, sl))
      if (s) return { day, slot: s }
    }
    return null
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createdAt, priority])

  const [view, setView] = useState(startOfMonth(suggested?.day ?? now))
  const [day, setDay] = useState<Date | null>(suggested?.day ?? null)
  const [slot, setSlot] = useState<Slot | null>(suggested?.slot ?? null)
  // Custom-time escape hatch: the supplier can propose a slot outside the
  // suggested window (e.g. later than the SLA deadline) for the RM to accept.
  const [useCustom, setUseCustom] = useState(false)
  const [custom, setCustom] = useState('')
  const customDate = custom ? fromLocalInput(custom) : null
  const customValid = !!customDate && !isNaN(customDate.getTime()) && customDate.getTime() > now.getTime() - 5 * 60_000

  const slotDisabled = (s: Slot) => !day || slotInPast(day, s)

  // Calendar cells for the current month view (leading blanks for alignment).
  const cells = useMemo(() => {
    const first = startOfMonth(view)
    const lead = colOf(first)
    const daysIn = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate()
    const out: (Date | null)[] = Array(lead).fill(null)
    for (let i = 1; i <= daysIn; i++) out.push(new Date(view.getFullYear(), view.getMonth(), i))
    return out
  }, [view])

  const canPrev = startOfMonth(view) > startOfMonth(minDay)
  const canNext = startOfMonth(view) < startOfMonth(maxDay)
  const shiftMonth = (n: number) => setView(v => new Date(v.getFullYear(), v.getMonth() + n, 1))

  const confirm = () => {
    if (useCustom) { if (customValid && customDate) onConfirm(customDate.toISOString()); return }
    if (!day || !slot) return
    const dt = new Date(day); dt.setHours(slot.h, slot.m, 0, 0)
    onConfirm(dt.toISOString())
  }
  const canConfirm = useCustom ? customValid : !!(day && slot)

  const maxFmt = max.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })
  const confirmLabel = useCustom
    ? (customValid && customDate ? `Use ${customDate.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}` : 'Pick a date & time')
    : (day && slot ? `Set ${day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })} ${fmtSlot(slot)}` : 'Pick a date & time')

  return (
    <div className="space-y-3">
      {/* Priority + deadline banner */}
      <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-2.5">
        <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">{P_LABEL[priority] ?? ''} priority</span> — schedule by <span className="font-semibold text-[var(--text)]">{maxFmt}</span>. Mon–Sat, 06:00–22:00.</p>
      </div>

      {!useCustom ? (
        <>
          {suggested && (
            <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" /> Suggested: <span className="font-medium text-[var(--text)]">{suggested.day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })} {fmtSlot(suggested.slot)}</span> — earliest slot that meets the deadline.
            </p>
          )}

          {/* Calendar card */}
          <div className="rounded-xl ring-1 ring-[var(--border)] p-3">
            <div className="flex items-center justify-between">
              <button type="button" disabled={!canPrev} onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
              <span className="text-sm font-semibold text-[var(--text)]">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
              <button type="button" disabled={!canNext} onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1 text-center">
              {DOW.map(d => <div key={d} className="py-1 text-[10px] font-semibold text-[var(--text-faint)]">{d.toUpperCase()}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} />
                const disabled = dayDisabled(d)
                const selected = day && d.toDateString() === day.toDateString()
                const isToday = d.toDateString() === now.toDateString()
                return (
                  <button key={d.toISOString()} type="button" disabled={disabled} onClick={() => { setDay(d); setSlot(null) }}
                    className={`relative aspect-square rounded-lg text-sm transition ${
                      selected ? 'bg-blue-600 font-bold text-white'
                      : disabled ? 'cursor-not-allowed text-[var(--text-faint)] opacity-40'
                      : 'text-[var(--text)] ring-1 ring-transparent hover:ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
                    {d.getDate()}
                    {isToday && !selected && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-blue-500" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Available times card */}
          {day && (
            <div className="rounded-xl ring-1 ring-[var(--border)] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"><Clock size={12} /> Available times <span className="normal-case font-normal">(Africa/Johannesburg)</span></div>
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                {SLOTS.map(s => {
                  const disabled = slotDisabled(s)
                  const selected = !!slot && slot.h === s.h && slot.m === s.m
                  return (
                    <button key={`${s.h}:${s.m}`} type="button" disabled={disabled} onClick={() => setSlot(s)}
                      className={`rounded-lg py-1.5 text-xs font-medium ring-1 transition ${
                        selected ? 'bg-blue-600 text-white ring-blue-600'
                        : disabled ? 'cursor-not-allowed text-[var(--text-faint)] opacity-40 ring-[var(--border)]'
                        : 'text-[var(--text)] ring-[var(--border)] hover:ring-blue-500'}`}>
                      {fmtSlot(s)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Custom escape hatch — a row that switches to the custom picker. */}
          <button type="button" onClick={() => setUseCustom(true)} className="flex w-full items-center justify-between gap-2 rounded-xl ring-1 ring-[var(--border)] px-3.5 py-3 text-left transition hover:bg-[var(--hover)]">
            <span className="flex items-center gap-2.5">
              <CalendarClock size={16} className="shrink-0 text-[var(--text-faint)]" />
              <span><span className="block text-sm font-semibold text-[var(--text)]">Set a custom date &amp; time</span><span className="block text-[11px] text-[var(--text-muted)]">Choose any date and time outside the suggested slots.</span></span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)]" />
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--text-muted)]">Choose any date and time that works best.</p>
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"><CalendarClock size={12} /> Custom date &amp; time (SA)</div>
            <input type="datetime-local" value={custom} min={toLocalInput(now)} onChange={e => setCustom(e.target.value)}
              className="w-full rounded-lg bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500/40" />
            {custom && !customValid && <p className="mt-1 text-[11px] text-red-500">Pick a future date and time.</p>}
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-2.5">
            <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-[var(--text-muted)]">A time past the deadline will be sent to the manager to accept.</p>
          </div>
          <button type="button" onClick={() => setUseCustom(false)} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to suggested slots</button>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || !canConfirm} onClick={confirm}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
          <CalendarClock size={15} /> {busy ? 'Scheduling…' : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-xl py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">Cancel</button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-faint)]"><Lock size={12} /> The job will be scheduled to this time once the quote is approved.</p>
    </div>
  )
}
