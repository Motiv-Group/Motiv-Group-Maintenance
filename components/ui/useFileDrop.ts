'use client'

// Drag-and-drop for any file input, with zero dependencies. Spread `dropProps`
// onto the container you want to accept drops, show a highlight while `isDragging`,
// and route dropped files through the SAME handler your <input onChange> uses.
//
//   const { isDragging, dropProps } = useFileDrop({ onFiles: addFiles, accept: 'image/*' })
//   <div {...dropProps} className={isDragging ? 'ring-2 ring-blue-500' : ''}> … </div>
//
// Files are filtered by `accept` (same syntax as the <input accept> attribute:
// "image/*", ".csv,.xlsx", "application/pdf") so a stray drop of the wrong type is
// ignored rather than uploaded. Dragging non-file content (text, links) never
// triggers the drop state.
import { useCallback, useRef, useState } from 'react'

/** Does `file` satisfy one of the `accept` patterns? (empty accept = anything) */
export function fileMatchesAccept(file: { name: string; type: string }, accept?: string): boolean {
  const pats = (accept ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (!pats.length) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return pats.some(p =>
    p.startsWith('.') ? name.endsWith(p)              // extension, e.g. ".csv"
    : p.endsWith('/*') ? type.startsWith(p.slice(0, -1)) // wildcard, e.g. "image/"
    : type === p,                                     // exact MIME, e.g. "application/pdf"
  )
}

export interface UseFileDrop {
  isDragging: boolean
  dropProps: {
    onDragEnter: (e: React.DragEvent) => void
    onDragOver: (e: React.DragEvent) => void
    onDragLeave: (e: React.DragEvent) => void
    onDrop: (e: React.DragEvent) => void
  }
}

export function useFileDrop({ onFiles, accept, multiple = true, disabled = false }: {
  /** Called with the accepted dropped files (already filtered + slice(0,1) when !multiple). */
  onFiles: (files: File[]) => void
  /** Same syntax as the <input accept> attribute. Omit to accept anything. */
  accept?: string
  /** When false, only the first dropped file is passed through. */
  multiple?: boolean
  disabled?: boolean
}): UseFileDrop {
  const [isDragging, setIsDragging] = useState(false)
  // dragenter/leave also fire on child elements — count depth so the highlight
  // only clears when the pointer truly leaves the drop container.
  const depth = useRef(0)

  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault()
    depth.current += 1
    setIsDragging(true)
  }, [disabled])

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (disabled || !hasFiles(e)) return
    e.preventDefault() // required for the drop event to fire
  }, [disabled])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (disabled) return
    depth.current -= 1
    if (depth.current <= 0) { depth.current = 0; setIsDragging(false) }
  }, [disabled])

  const onDrop = useCallback((e: React.DragEvent) => {
    if (disabled) return
    e.preventDefault()
    depth.current = 0
    setIsDragging(false)
    let files = Array.from(e.dataTransfer?.files ?? [])
    if (accept) files = files.filter(f => fileMatchesAccept(f, accept))
    if (!multiple) files = files.slice(0, 1)
    if (files.length) onFiles(files)
  }, [disabled, accept, multiple, onFiles])

  return { isDragging, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } }
}
