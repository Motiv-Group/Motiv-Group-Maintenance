'use client'

// Themed date + time picker for scheduling a job. Disables: past dates/times,
// Sundays, dates beyond the ticket-priority window, and non-operating hours
// (Mon–Sat 06:00–22:00). A "custom date & time" escape hatch lets the supplier
// propose a slot outside the suggested window (sent to the RM to accept). No
// external dependency.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Clock, CalendarClock } from 'lucide-react'

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

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        {P_LABEL[priority] ?? ''} priority — schedule by{' '}
        <span className="font-semibold text-[var(--text)]">{max.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}</span>. Mon–Sat, 06:00–22:00.
      </p>
      {suggested && !useCustom && (
        <p className="text-[11px] text-[#C6A35D]">Suggested: {suggested.day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })} {fmtSlot(suggested.slot)} — earliest slot that meets the deadline.</p>
      )}

      {!useCustom && (
        <>
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button type="button" disabled={!canPrev} onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
            <span className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5"><Calendar size={14} className="text-[#C6A35D]" /> {MONTHS[view.getMonth()]} {view.getFullYear()}</span>
            <button type="button" disabled={!canNext} onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {DOW.map(d => <div key={d} className="text-[10px] font-semibold text-[var(--text-faint)] py-1">{d}</div>)}
            {cells.map((d, i) => {
              if (!d) return <div key={`b${i}`} />
              const disabled = dayDisabled(d)
              const selected = day && d.toDateString() === day.toDateString()
              return (
                <button key={d.toISOString()} type="button" disabled={disabled}
                  onClick={() => { setDay(d); setSlot(null) }}
                  className={`aspect-square rounded-lg text-sm transition ${
                    selected ? 'bg-[#C6A35D] text-[#0a0e17] font-bold'
                    : disabled ? 'text-[var(--text-faint)] opacity-40 cursor-not-allowed'
                    : 'text-[var(--text)] hover:bg-[var(--hover)]'}`}>
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Time slots */}
          {day && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5 flex items-center gap-1.5"><Clock size={12} /> Pick a time</div>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                {SLOTS.map(s => {
                  const disabled = slotDisabled(s)
                  const selected = !!slot && slot.h === s.h && slot.m === s.m
                  return (
                    <button key={`${s.h}:${s.m}`} type="button" disabled={disabled} onClick={() => setSlot(s)}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                        selected ? 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]'
                        : disabled ? 'text-[var(--text-faint)] opacity-40 border-[var(--border)] cursor-not-allowed'
                        : 'text-[var(--text)] border-[var(--border)] hover:border-[#C6A35D]'}`}>
                      {fmtSlot(s)}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Custom date & time — for when the suggested slots don't work. May fall
          outside the SLA window; it goes to the manager to accept. */}
      {useCustom && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5 flex items-center gap-1.5"><CalendarClock size={12} /> Custom date &amp; time (SA)</div>
          <input type="datetime-local" value={custom} min={toLocalInput(now)} onChange={e => setCustom(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-[var(--input-bg)] ring-1 ring-[var(--border)] text-[var(--text)] text-sm outline-none focus:ring-[#C6A35D]/40" />
          {custom && !customValid && <p className="text-[11px] text-red-500 mt-1">Pick a future date and time.</p>}
          <p className="text-[11px] text-[var(--text-faint)] mt-1">A time past the deadline will be sent to the manager to accept.</p>
        </div>
      )}

      <button type="button" onClick={() => { setUseCustom(v => !v) }}
        className="text-[11px] font-medium text-[#C6A35D] hover:underline">
        {useCustom ? '← Back to suggested slots' : "None of these work? Pick a custom date & time"}
      </button>

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || !canConfirm} onClick={confirm}
          className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Scheduling…'
            : useCustom ? (customValid && customDate ? `Schedule ${customDate.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' })}` : 'Pick a date & time')
            : day && slot ? `Schedule ${day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })} ${fmtSlot(slot)}` : 'Pick a date & time'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Cancel</button>
      </div>
    </div>
  )
}
