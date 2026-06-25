'use client'

// Themed date + time picker for scheduling a job. Disables: past dates/times,
// Sundays, dates beyond the ticket-priority window, and non-operating hours
// (Mon–Sat 07:00–17:00). No external dependency.
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, Clock } from 'lucide-react'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17] // 07:00–17:00 slots
const WINDOW_H: Record<string, number> = { P1: 8, P2: 24, P3: 72, P4: 168 }
const P_LABEL: Record<string, string> = { P1: 'Urgent', P2: 'High', P3: 'Medium', P4: 'Low' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
// Monday-first column index (Mon=0 … Sun=6)
const colOf = (d: Date) => (d.getDay() + 6) % 7
const fmtHour = (h: number) => `${String(h).padStart(2, '0')}:00`

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

  const [view, setView] = useState(startOfMonth(now))
  const [day, setDay] = useState<Date | null>(null)
  const [hour, setHour] = useState<number | null>(null)

  const dayDisabled = (d: Date) => {
    const sd = startOfDay(d)
    return sd < minDay || sd > maxDay || d.getDay() === 0 // no Sundays
  }
  const hourDisabled = (h: number) => {
    if (!day) return true
    const dt = new Date(day); dt.setHours(h, 0, 0, 0)
    return dt < now // the day is already capped to the window; only block past times
  }

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
    if (!day || hour == null) return
    const dt = new Date(day); dt.setHours(hour, 0, 0, 0)
    onConfirm(dt.toISOString())
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        {P_LABEL[priority] ?? ''} priority — schedule by{' '}
        <span className="font-semibold text-[var(--text)]">{max.toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>. Mon–Sat, 07:00–17:00.
      </p>

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
              onClick={() => { setDay(d); setHour(null) }}
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
            {HOURS.map(h => {
              const disabled = hourDisabled(h)
              const selected = hour === h
              return (
                <button key={h} type="button" disabled={disabled} onClick={() => setHour(h)}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition ${
                    selected ? 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D]'
                    : disabled ? 'text-[var(--text-faint)] opacity-40 border-[var(--border)] cursor-not-allowed'
                    : 'text-[var(--text)] border-[var(--border)] hover:border-[#C6A35D]'}`}>
                  {fmtHour(h)}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" disabled={busy || !day || hour == null} onClick={confirm}
          className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50">
          {busy ? 'Scheduling…' : day && hour != null ? `Schedule ${day.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} ${fmtHour(hour)}` : 'Pick a date & time'}
        </button>
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Cancel</button>
      </div>
    </div>
  )
}
