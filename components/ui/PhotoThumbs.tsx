'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useScrollLock } from '@/lib/useScrollLock'

/**
 * Evidence photo strip: thumbnails + swipeable lightbox. Replaces the old
 * "Photo 1 / Photo 2" text links — evidence should be visible at a glance.
 * When `ticketId` is set, opening a photo fires the same fire-and-forget
 * view-tracking POST the old ViewTrackedLink recorded, so the audit trail
 * still shows "viewed Photo 2".
 */
export function PhotoThumbs({ urls, ticketId, label = 'Photo', limit, onMore }: {
  urls: string[]
  ticketId?: string
  label?: string
  /** Cap the number of tiles: shows limit-1 thumbnails + a "+N" overflow tile and
   *  a "View all N photos" link. The lightbox still steps through every photo. */
  limit?: number
  /** When set, the overflow tile reads "View all / N photos" and calls this
   *  (e.g. expand in place) instead of opening the lightbox; the separate
   *  "View all N photos" text link is not rendered. */
  onMore?: () => void
}) {
  const [open, setOpen] = useState<number | null>(null)

  // Lock page scroll while the lightbox overlay is open.
  useScrollLock(open !== null)

  const track = useCallback((i: number) => {
    if (!ticketId) return
    fetch(`/api/tickets/${ticketId}/view`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemType: 'photo', itemLabel: `${label} ${i + 1}` }),
    }).catch(() => {})
  }, [ticketId, label])

  const show = (i: number) => { setOpen(i); track(i) }
  const step = useCallback((d: 1 | -1) => {
    setOpen(cur => {
      if (cur === null) return cur
      const next = (cur + d + urls.length) % urls.length
      track(next)
      return next
    })
  }, [urls.length, track])

  // Keyboard: arrows navigate, Escape closes.
  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') step(1)
      if (e.key === 'ArrowLeft') step(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, step])

  if (!urls.length) return null

  // Optional cap: show limit-1 thumbnails + a "+N" overflow tile.
  const truncated = typeof limit === 'number' && limit > 0 && urls.length > limit
  const visible = truncated ? urls.slice(0, limit - 1) : urls
  const moreCount = truncated ? urls.length - (limit - 1) : 0

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visible.map((u, i) => (
          <button
            key={i} type="button" onClick={() => show(i)}
            className="group relative h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-2)] focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            title={`View ${label.toLowerCase()} ${i + 1}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image can't optimize it */}
            <img src={u} alt={`${label} ${i + 1}`} loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">{i + 1}</span>
          </button>
        ))}
        {truncated && (
          <button
            type="button" onClick={onMore ?? (() => show(limit! - 1))}
            className="grid h-20 w-20 sm:h-24 sm:w-24 place-items-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface-2)] text-sm font-semibold text-[var(--text-muted)] transition hover:bg-[var(--hover)] focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            title={`View all ${urls.length} ${label.toLowerCase()}s`}
          >
            {onMore ? <span className="px-1 text-center text-xs leading-tight">View all<br />{urls.length} photos</span> : <>+{moreCount}</>}
          </button>
        )}
      </div>
      {truncated && !onMore && (
        <button type="button" onClick={() => show(0)} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-blue-600 transition hover:underline dark:text-blue-400">
          View all {urls.length} photos <ChevronRight size={15} />
        </button>
      )}

      {open !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed URL lightbox */}
          <img src={urls[open]} alt={`${label} ${open + 1}`} className="max-h-full max-w-full rounded-lg" onClick={e => e.stopPropagation()} />

          {urls.length > 1 && (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); step(-1) }} title="Previous"
                className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronLeft size={22} /></button>
              <button type="button" onClick={e => { e.stopPropagation(); step(1) }} title="Next"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ChevronRight size={22} /></button>
            </>
          )}

          <div className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white">
            {label} {open + 1} of {urls.length}
          </div>
          <a href={urls[open]} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Open full size"
            className="absolute top-4 right-16 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><ExternalLink size={18} /></a>
          <button type="button" onClick={() => setOpen(null)} title="Close"
            className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"><X size={18} /></button>
        </div>
      )}
    </>
  )
}
