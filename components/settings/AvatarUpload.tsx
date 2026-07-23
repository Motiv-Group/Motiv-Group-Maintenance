'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Trash2 } from 'lucide-react'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { useFileDrop } from '@/components/ui/useFileDrop'
import { errMsg } from '@/components/ui/errMsg'

// Change/remove the signed-in user's profile picture. Shown at the top of
// Settings → Profile for every role.
export function AvatarUpload({ name, avatarUrl }: { name: string | null; avatarUrl: string | null }) {
  const router = useRouter()
  const [url, setUrl] = useState<string | null>(avatarUrl)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File | undefined) {
    if (!file) return
    // Android WebView can report an empty MIME type — accept it (picker limits to images).
    if (file.type && !file.type.startsWith('image/')) { setErr('Choose an image file.'); return }
    if (file.size > 8 * 1024 * 1024) { setErr('Image is over 8MB.'); return }
    setBusy(true); setErr('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Upload failed')
      setUrl(data.url); router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  // Route both the <input> picker and drag-and-drop through the same upload path.
  function addFiles(files: File[]) { upload(files[0]) }

  const { isDragging, dropProps } = useFileDrop({ onFiles: addFiles, accept: 'image/*', multiple: false, disabled: busy })

  async function remove() {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? 'Failed') }
      setUrl(null); router.refresh()
    } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  return (
    <div {...dropProps} className={`flex items-center gap-4 rounded-2xl transition ${isDragging ? 'ring-2 ring-blue-500 bg-blue-500/5' : ''}`}>
      <UserAvatar name={name} avatarUrl={url} size={64} className="ring-1 ring-[var(--border)]" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-semibold text-white transition disabled:opacity-50">
            <Camera size={15} /> {url ? 'Change' : 'Upload photo'}
          </button>
          {url && (
            <button type="button" onClick={remove} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-xl ring-1 ring-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-muted)] hover:bg-[var(--hover)] transition disabled:opacity-50">
              <Trash2 size={15} /> Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { addFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
        </div>
        <p className="mt-1 text-[11px] text-[var(--text-faint)]">{isDragging ? 'Drop image here…' : 'PNG, JPEG or WebP · up to 8MB · squared automatically.'}</p>
        {err && <p className="mt-1 text-xs text-red-500">{err}</p>}
      </div>
    </div>
  )
}
