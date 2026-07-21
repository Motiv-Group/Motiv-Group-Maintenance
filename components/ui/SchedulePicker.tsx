'use client'

// Themed date + time picker for scheduling a job. Two-column layout (calendar on
// the left, time selection on the right). Disables: past dates/times, Sundays,
// dates beyond the ticket-priority window, and non-operating hours (Mon–Sat
// 06:00–22:00). A "custom date & time" escape hatch lets the supplier propose a
// slot outside the suggested window (sent to the RM to accept) — any future date,
// operating hours only. No external dependency.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, CalendarClock, Info, Star, ArrowLeft, Lock, Calendar } from 'lucide-react'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WINDOW_H: Record<string, number> = { P1: 8, P2: 24, P3: 72, P4: 168 }
const P_LABEL: Record<string, string> = { P1: 'Urgent', P2: 'High', P3: 'Medium', P4: 'Low' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
// Operating hours in minutes-from-midnight: 06:00 … 22:00.
const OPEN_MIN = 6 * 60
const CLOSE_MIN = 22 * 60

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
// Monday-first column index (Mon=0 … Sun=6)
const colOf = (d: Date) => (d.getDay() + 6) % 7
const pad = (n: number) => String(n).padStart(2, '0')
type Slot = { h: number; m: number }
const fmtSlot = (s: Slot) => `${pad(s.h)}:${pad(s.m)}`
const fmtYMD = (d: Date) => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
// Urgent tickets get finer 30-min slots; everything else is hourly. 06:00–22:00.
function buildSlots(priority: string): Slot[] {
  const step = priority === 'P1' ? 30 : 60
  const out: Slot[] = []
  for (let mins = OPEN_MIN; mins <= CLOSE_MIN; mins += step) out.push({ h: Math.floor(mins / 60), m: mins % 60 })
  return out
}

const LBL = 'block text-sm font-semibold text-[var(--text)] mb-1.5'

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
  // Custom mode may pick any future date; cap the forward calendar nav ~6 months out.
  const customMaxDay = startOfDay(new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()))
  const SLOTS = useMemo(() => buildSlots(priority), [priority])

  const dayDisabled = (d: Date) => {
    const sd = startOfDay(d)
    return sd < minDay || sd > maxDay || d.getDay() === 0 // no Sundays
  }
  const customDayDisabled = (d: Date) => startOfDay(d) < minDay // any future day; no Sunday cap
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
  const [customDay, setCustomDay] = useState<Date | null>(suggested?.day ?? (startOfDay(now)))
  const [customH, setCustomH] = useState<number>(suggested?.slot.h ?? 12)
  const [customM, setCustomM] = useState<number>(suggested?.slot.m ?? 0)

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
  const canNext = startOfMonth(view) < startOfMonth(useCustom ? customMaxDay : maxDay)
  const shiftMonth = (n: number) => setView(v => new Date(v.getFullYear(), v.getMonth() + n, 1))

  // Quick-pick times for the custom view — the standard hourly set, plus the
  // currently-chosen time if it isn't already one of them, kept in order.
  const quickTimes = useMemo(() => {
    const base: Slot[] = [6, 8, 10, 12, 14, 16, 18, 20, 22].map(h => ({ h, m: 0 }))
    const cur = { h: customH, m: customM }
    const list = base.some(t => t.h === cur.h && t.m === cur.m) ? base : [...base, cur]
    return list.filter(t => t.h * 60 + t.m >= OPEN_MIN && t.h * 60 + t.m <= CLOSE_MIN).sort((a, b) => (a.h - b.h) || (a.m - b.m))
  }, [customH, customM])

  const customMins = customH * 60 + customM
  const customDate = useMemo(() => {
    if (!customDay) return null
    const d = new Date(customDay); d.setHours(customH, customM, 0, 0); return d
  }, [customDay, customH, customM])
  const customValid = !!customDate && customMins >= OPEN_MIN && customMins <= CLOSE_MIN && customDate.getTime() > now.getTime() - 5 * 60_000

  const confirm = () => {
    if (useCustom) { if (customValid && customDate) onConfirm(customDate.toISOString()); return }
    if (!day || !slot) return
    const dt = new Date(day); dt.setHours(slot.h, slot.m, 0, 0)
    onConfirm(dt.toISOString())
  }
  const canConfirm = useCustom ? customValid : !!(day && slot)

  const dtFmt = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' } as const
  const maxFmt = max.toLocaleString('en-ZA', dtFmt)
  const confirmLabel = useCustom
    ? (customValid && customDate ? `Use ${customDate.toLocaleString('en-ZA', dtFmt)}` : 'Pick a date & time')
    : (day && slot ? `Set ${day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })} ${fmtSlot(slot)}` : 'Pick a date & time')

  // Shared calendar grid — same look for both the suggested and custom views.
  const calendar = (selectedDay: Date | null, onPick: (d: Date) => void, isDisabled: (d: Date) => boolean) => (
    <div className="rounded-lg ring-1 ring-[var(--border)] p-3">
      <div className="flex items-center justify-between">
        <button type="button" disabled={!canPrev} onClick={() => shiftMonth(-1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"><ChevronLeft size={16} /></button>
        <span className="text-sm font-semibold text-[var(--text)]">{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
        <button type="button" disabled={!canNext} onClick={() => shiftMonth(1)} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--hover)] disabled:opacity-30 disabled:cursor-not-allowed"><ChevronRight size={16} /></button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {DOW.map(d => <div key={d} className="py-1 text-[10px] font-semibold text-[var(--text-faint)]">{d.toUpperCase()}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />
          const disabled = isDisabled(d)
          const selected = selectedDay && d.toDateString() === selectedDay.toDateString()
          const isToday = d.toDateString() === now.toDateString()
          return (
            <button key={d.toISOString()} type="button" disabled={disabled} onClick={() => onPick(d)}
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
  )

  return (
    <div className="space-y-3">
      {/* Priority + deadline banner */}
      <div className="flex items-start gap-2.5 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-2.5">
        <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-[var(--text-muted)]"><span className="font-semibold text-[var(--text)]">{P_LABEL[priority] ?? ''} priority</span> — schedule by <span className="font-semibold text-[var(--text)]">{maxFmt}</span>. Mon–Sat, 06:00–22:00.</p>
      </div>

      {!useCustom ? (
        <>
          {suggested && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <Star size={14} className="shrink-0 fill-amber-400 text-amber-400" /> Suggested: <span className="font-medium text-[var(--text)]">{suggested.day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' })} {fmtSlot(suggested.slot)}</span> — earliest slot that meets the deadline.
            </p>
          )}

          {/* Calendar (left) + available times (right). */}
          <div className="grid gap-4 sm:grid-cols-2">
            {calendar(day, d => { setDay(d); setSlot(null) }, dayDisabled)}

            <div className="rounded-lg ring-1 ring-[var(--border)] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-faint)]"><Clock size={12} /> Available times <span className="normal-case font-normal">(Africa/Johannesburg)</span></div>
              {day ? (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
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
              ) : (
                <p className="py-8 text-center text-sm text-[var(--text-faint)]">Select a date to see available times.</p>
              )}
            </div>
          </div>

          {/* Custom escape hatch — a row that switches to the custom picker. */}
          <button type="button" onClick={() => setUseCustom(true)} className="flex w-full items-center justify-between gap-2 rounded-lg ring-1 ring-[var(--border)] px-3.5 py-3 text-left transition hover:bg-[var(--hover)]">
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

          {/* Selected date + time summary fields. */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={LBL}>Select date</span>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[var(--input-bg)] px-3.5 py-2.5 ring-1 ring-[var(--border)]">
                <span className="text-sm text-[var(--text)]">{customDay ? fmtYMD(customDay) : 'Pick a date below'}</span>
                <Calendar size={16} className="shrink-0 text-[var(--text-faint)]" />
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">Format: YYYY/MM/DD</p>
            </div>
            <div>
              <span className={LBL}>Select time</span>
              <div className="flex items-center gap-2">
                <input type="number" min={6} max={22} value={customH} onChange={e => setCustomH(Math.max(6, Math.min(22, Number(e.target.value) || 6)))}
                  className="w-16 rounded-lg bg-[var(--input-bg)] px-3 py-2.5 text-center text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500/40" aria-label="Hour" />
                <span className="text-[var(--text-faint)]">:</span>
                <input type="number" min={0} max={59} value={customM} onChange={e => setCustomM(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
                  className="w-16 rounded-lg bg-[var(--input-bg)] px-3 py-2.5 text-center text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none focus:ring-2 focus:ring-blue-500/40" aria-label="Minute" />
                <span className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5 text-xs font-semibold text-[var(--text-muted)] ring-1 ring-[var(--border)]">SAST</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">Between 06:00 and 22:00</p>
            </div>
          </div>

          {/* Calendar (left) + quick-select time (right). */}
          <div className="grid gap-4 sm:grid-cols-2">
            {calendar(customDay, d => setCustomDay(d), customDayDisabled)}

            <div>
              <span className={LBL}>Quick select time</span>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-1">
                {quickTimes.map(t => {
                  const selected = t.h === customH && t.m === customM
                  return (
                    <button key={`${t.h}:${t.m}`} type="button" onClick={() => { setCustomH(t.h); setCustomM(t.m) }}
                      className={`rounded-lg py-2 text-sm font-medium ring-1 transition ${selected ? 'bg-blue-600 text-white ring-blue-600' : 'text-[var(--text)] ring-[var(--border)] hover:ring-blue-500'}`}>
                      {fmtSlot(t)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {!customValid && customDate && <p className="text-[11px] text-red-500">Pick a future date and time within operating hours (06:00–22:00).</p>}

          <div className="flex items-start gap-2.5 rounded-lg bg-blue-500/10 ring-1 ring-blue-500/25 px-3.5 py-2.5">
            <Info size={15} className="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <p className="text-sm text-[var(--text-muted)]">A time past the deadline will be sent to the client to accept.</p>
          </div>

          <button type="button" onClick={() => setUseCustom(false)} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to suggested slots</button>

          {/* Return to the recommended-slot picker (mirrors the "custom" escape hatch). */}
          <button type="button" onClick={() => setUseCustom(false)} className="flex w-full items-center justify-between gap-2 rounded-lg ring-1 ring-[var(--border)] px-3.5 py-3 text-left transition hover:bg-[var(--hover)]">
            <span className="flex items-center gap-2.5">
              <CalendarClock size={16} className="shrink-0 text-[var(--text-faint)]" />
              <span><span className="block text-sm font-semibold text-[var(--text)]">Use a suggested slot instead</span><span className="block text-[11px] text-[var(--text-muted)]">View available recommended times.</span></span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-[var(--text-faint)]" />
          </button>
        </>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || !canConfirm} onClick={confirm}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
          <CalendarClock size={15} /> {busy ? 'Scheduling…' : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-medium text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">Cancel</button>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--text-faint)]"><Lock size={12} /> The job will be scheduled to this time once the quote is approved.</p>
    </div>
  )
}
