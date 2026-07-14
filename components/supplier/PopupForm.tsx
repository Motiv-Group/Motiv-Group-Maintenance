'use client'

import { useState, cloneElement, type ReactElement } from 'react'
import { Modal } from '@/components/ui/Modal'

// Opens an existing supplier form (quote upload, COC/POC, variation order) in a
// pop-up. The trigger is a full-width button; `children` is the form element,
// rendered with `defaultOpen` so it shows expanded (no inner toggle). We clone it
// on the client to inject an `onClose` that closes the modal, so the form's own
// Cancel dismisses the pop-up — no functions cross the server→client boundary. On a
// successful submit the form calls router.refresh(), which re-renders the page and
// unmounts this popup when the action no longer applies.
export function PopupForm({ label, tone = 'primary', maxWidth = 'max-w-2xl', children }: {
  label: string
  tone?: 'primary' | 'success' | 'danger'
  maxWidth?: string
  children: ReactElement<{ onClose?: () => void }>
}) {
  const [open, setOpen] = useState(false)
  const btn = tone === 'success'
    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
    : tone === 'danger'
      ? 'ring-1 ring-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10'
      : 'bg-blue-600 hover:bg-blue-500 text-white'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`w-full py-2.5 rounded-lg text-sm font-semibold transition ${btn}`}>{label}</button>
      {open && <Modal onClose={() => setOpen(false)} maxWidth={maxWidth}>{() => <div>{cloneElement(children, { onClose: () => setOpen(false) })}</div>}</Modal>}
    </>
  )
}
