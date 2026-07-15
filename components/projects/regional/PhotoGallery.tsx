'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ChevronLeft, ChevronRight, Download, ImageOff } from 'lucide-react'
import type { ProjectFileView } from '@/lib/projects/data'

export function PhotoGallery({ title, photos }: { title: string; photos: ProjectFileView[] }) {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <div>
      <h3 className="text-sm font-bold text-[var(--text)] mb-2">{title} <span className="text-[11px] font-normal text-[var(--text-faint)]">({photos.length})</span></h3>
      {photos.length === 0 ? (
        <div className="rounded-xl ring-1 ring-[var(--border)] p-6 flex flex-col items-center gap-1 text-[var(--text-faint)]">
          <ImageOff size={22} />
          <span className="text-xs">No {title.toLowerCase()} uploaded yet</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => setOpen(i)} className="group relative aspect-square rounded-lg overflow-hidden ring-1 ring-[var(--border)] bg-[var(--surface-2)]">
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={p.caption ?? ''} className="h-full w-full object-cover transition group-hover:scale-105" />
              )}
              {p.caption && <span className="absolute bottom-0 inset-x-0 bg-black/50 px-1 py-0.5 text-[9px] text-white truncate">{p.caption}</span>}
            </button>
          ))}
        </div>
      )}
      {open != null && <Lightbox photos={photos} index={open} onClose={() => setOpen(null)} onIndex={setOpen} />}
    </div>
  )
}

function Lightbox({ photos, index, onClose, onIndex }: { photos: ProjectFileView[]; index: number; onClose: () => void; onIndex: (i: number) => void }) {
  const [mounted, setMounted] = useState(false)
  const p = photos[index]

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only portal-mount gate; must run after mount so createPortal(document.body) never runs during SSR
    setMounted(true)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (e.key === 'ArrowRight' && index < photos.length - 1) onIndex(index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndex])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button className="absolute top-4 right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={onClose}><X size={18} /></button>
      {index > 0 && (
        <button className="absolute left-2 sm:left-6 rounded-full bg-white/10 p-3 sm:p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onIndex(index - 1) }}><ChevronLeft size={22} /></button>
      )}
      {index < photos.length - 1 && (
        <button className="absolute right-2 sm:right-6 rounded-full bg-white/10 p-3 sm:p-2 text-white hover:bg-white/20" onClick={(e) => { e.stopPropagation(); onIndex(index + 1) }}><ChevronRight size={22} /></button>
      )}
      <div className="max-h-[88vh] max-w-[92vw] flex flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {p.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.url} alt={p.caption ?? ''} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        )}
        <div className="flex items-center gap-3 text-xs text-white/80">
          {p.caption && <span>{p.caption}</span>}
          <span className="text-white/50">{index + 1} / {photos.length}</span>
          {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-white hover:text-blue-300"><Download size={13} /> Download</a>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
