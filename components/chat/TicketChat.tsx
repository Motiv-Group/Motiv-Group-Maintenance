'use client'

// Per-ticket RM ↔ awarded-supplier chat pop-up. A free-form message thread (text +
// attachments) scoped to one ticket. Opens from the ticket's "More" menu and from a
// message icon in the ticket-detail header. Fetches the thread on open and polls
// while open (deny-all RLS means no browser Realtime — the cross-page signal is the
// notification + push fired by the API on send). Mirrors the dispute thread's look.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import { ViewTrackedLink } from '@/components/ui/ViewTrackedLink'
import { MessageSquare, Paperclip, Send, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react'
import { uploadOne } from '@/lib/upload'
import { formatDateTime } from '@/lib/utils'

export type ChatViewerRole = 'supplier' | 'regional_manager' | 'store_manager' | 'individual'

interface ChatMessage {
  id: string
  author_role: string
  body: string | null
  created_at: string
  mine: boolean
  attachment_urls: string[]
}

const OTHER_LABEL: Record<ChatViewerRole, string> = {
  supplier: 'regional manager',
  regional_manager: 'supplier',
  store_manager: 'team',
  individual: 'supplier',
}
const ROLE_LABEL: Record<string, string> = { supplier: 'Supplier', regional_manager: 'Regional Manager', store_manager: 'Store Manager', individual: 'Client' }
const AVATAR_CLS: Record<string, string> = {
  supplier: 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
  regional_manager: 'bg-teal-500/20 text-teal-700 dark:text-teal-300',
  store_manager: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  individual: 'bg-teal-500/20 text-teal-700 dark:text-teal-300',
}
const roleInitial = (r: string) => (r === 'supplier' ? 'S' : r === 'regional_manager' ? 'M' : r === 'store_manager' ? 'SM' : r === 'individual' ? 'C' : '?')
const isImageUrl = (url: string) => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)
function attachmentName(url: string): string {
  try {
    const raw = decodeURIComponent((url.split('?')[0].split('/').pop() || '').trim())
    return raw.replace(/^\d{6,}-[a-z0-9]{4,}-/i, '') || 'Attachment'
  } catch { return 'Attachment' }
}
// Images → ticket-photos; everything else → ticket-docs (mirrors the dispute uploader).
async function uploadAttachment(file: File): Promise<string> {
  return uploadOne(file, file.type.startsWith('image/') ? 'ticket-photos' : 'ticket-docs')
}

const MAX_CHARS = 2000
const MAX_FILES = 5
const POLL_MS = 6000

// Header entry point: a compact message icon (with an unread dot) that opens the
// chat. A client wrapper so a Server Component can drop it in without passing a
// function `trigger` across the RSC boundary.
export function TicketChatIcon({ ticketId, viewerRole, unread = false }: { ticketId: string; viewerRole: ChatViewerRole; unread?: boolean }) {
  return (
    <TicketChat ticketId={ticketId} viewerRole={viewerRole} trigger={open => (
      <button type="button" onClick={open} aria-label={`Chat with the ${OTHER_LABEL[viewerRole]}`}
        className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]">
        <MessageSquare size={18} />
        {unread && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-[var(--surface)]" />}
      </button>
    )} />
  )
}

export function TicketChat({ ticketId, viewerRole, defaultOpen = false, onClose, trigger }: {
  ticketId: string
  viewerRole: ChatViewerRole
  defaultOpen?: boolean
  onClose?: () => void
  trigger?: (open: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const close = () => { setOpen(false); onClose?.() }
  return (
    <>
      {trigger?.(() => setOpen(true))}
      {open && (
        <Modal onClose={close} maxWidth="max-w-2xl">
          {dismiss => <ChatBody ticketId={ticketId} viewerRole={viewerRole} onClose={dismiss} />}
        </Modal>
      )}
    </>
  )
}

function ChatBody({ ticketId, viewerRole, onClose }: { ticketId: string; viewerRole: ChatViewerRole; onClose: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [smAdded, setSmAdded] = useState(false)
  const [canManageSm, setCanManageSm] = useState(false)
  const [err, setErr] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  // All state updates land after the await, so this never sets state synchronously
  // within the effect (loading starts true via useState; finally clears it).
  async function load() {
    try {
      const r = await fetch(`/api/tickets/${ticketId}/chat`)
      const d = await r.json()
      if (d?.error) { setErr(d.error); return }
      setErr(''); setAvailable(d.available !== false); setMessages(d.messages ?? [])
      setSmAdded(!!d.smAdded); setCanManageSm(!!d.canManageSm)
    } catch { setErr('Could not load the conversation.') }
    finally { setLoading(false) }
  }

  // Initial load + poll while open (deny-all RLS means no browser Realtime).
  useEffect(() => {
    let live = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is set only after the async fetch resolves, not synchronously in the effect body
    load()
    const t = setInterval(() => { if (live) load() }, POLL_MS)
    return () => { live = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  // Keep the view pinned to the newest message unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--text)]"><MessageSquare size={19} className="text-blue-500" /> {viewerRole === 'store_manager' ? 'Ticket chat' : `Chat with the ${OTHER_LABEL[viewerRole]}`}</h3>
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1 rounded-lg p-1.5 text-[var(--text-faint)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"><X size={18} /></button>
      </div>

      {loading ? <p className="py-6 text-center text-sm text-[var(--text-faint)]">Loading…</p>
        : err ? <p className="text-sm text-red-500">{err}</p>
        : !available ? <p className="py-6 text-center text-sm text-[var(--text-faint)]">Chat opens once a supplier is assigned to this ticket.</p>
        : (
          <>
            {canManageSm && <SmParticipantBar ticketId={ticketId} smAdded={smAdded} onChanged={load} />}
            <div ref={scrollRef} onScroll={onScroll} className="max-h-[440px] min-h-[160px] space-y-3 overflow-y-auto rounded-xl bg-[var(--app-bg)] p-3 ring-1 ring-[var(--border)]">
              {messages.length === 0 && <p className="py-8 text-center text-sm text-[var(--text-faint)]">No messages yet. Say hello 👋</p>}
              {messages.map(m => {
                const mine = m.mine
                const urls = m.attachment_urls ?? []
                return (
                  <div key={m.id} className={`flex items-start gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${AVATAR_CLS[m.author_role] ?? AVATAR_CLS.supplier}`}>{roleInitial(m.author_role)}</span>
                    <div className={`min-w-0 max-w-[82%] rounded-2xl px-3.5 py-2.5 ${mine ? 'rounded-tr-sm bg-blue-600 text-white' : 'rounded-tl-sm bg-[var(--surface)] text-[var(--text)] ring-1 ring-[var(--border)]'}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className={`text-[11px] font-bold ${mine ? 'text-white' : 'text-[var(--text)]'}`}>{mine ? 'You' : (ROLE_LABEL[m.author_role] ?? m.author_role)}</span>
                        <span className={`text-[10px] ${mine ? 'text-white/60' : 'text-[var(--text-faint)]'}`}>{formatDateTime(m.created_at)}</span>
                      </div>
                      {m.body && <p className="whitespace-pre-line break-words text-sm">{m.body}</p>}
                      {urls.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {urls.map((u, j) => (
                            <ViewTrackedLink key={j} ticketId={ticketId} itemType="attachment" itemLabel={attachmentName(u)} href={u}
                              className={`flex max-w-[200px] items-center gap-2 rounded-lg p-1.5 pr-2.5 transition ${mine ? 'bg-white/10 hover:bg-white/20' : 'bg-[var(--surface-2)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'}`}>
                              {isImageUrl(u)
                                /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed remote thumbnail */
                                ? <img src={u} alt="" className="h-9 w-9 shrink-0 rounded object-cover" />
                                : <span className={`grid h-9 w-9 shrink-0 place-items-center rounded ${mine ? 'bg-white/15 text-white' : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'}`}><FileText size={16} /></span>}
                              <span className={`min-w-0 truncate text-[11px] font-medium ${mine ? 'text-white' : 'text-[var(--text)]'}`}>{attachmentName(u)}</span>
                            </ViewTrackedLink>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <ChatComposer ticketId={ticketId} onSent={() => { atBottomRef.current = true; load() }} />
          </>
        )}
    </div>
  )
}

function ChatComposer({ ticketId, onSent }: { ticketId: string; onSent: () => void }) {
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!text.trim() && !files.length) { setErr('Add a message or attach a file.'); return }
    setBusy(true); setErr('')
    try {
      const urls: string[] = []
      for (const f of files) urls.push(await uploadAttachment(f))
      const res = await fetch(`/api/tickets/${ticketId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text.trim() || null, attachmentUrls: urls }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed to send')
      setText(''); setFiles([]); onSent()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-2.5">
      <textarea value={text} onChange={e => setText(e.target.value.slice(0, MAX_CHARS))} placeholder="Write a message…" rows={2}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit() } }}
        className="w-full rounded-xl bg-[var(--input-bg)] px-3 py-2.5 text-sm text-[var(--text)] ring-1 ring-[var(--border)] outline-none placeholder-[var(--text-faint)] focus:ring-blue-500/40" />
      {files.length > 0 && (
        <div className="space-y-1">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-sm text-[var(--text-muted)]">
              <span className="flex min-w-0 items-center gap-1.5 truncate">{f.type.startsWith('image/') ? <ImageIcon size={13} className="shrink-0" /> : <FileText size={13} className="shrink-0" />}<span className="truncate">{f.name}</span></span>
              <button type="button" onClick={() => setFiles(p => p.filter((_, j) => j !== i))} className="shrink-0 text-[var(--text-faint)] hover:text-red-500"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-xs text-red-500">{err}</p>}
      <div className="flex items-center gap-2">
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">
          <Paperclip size={15} /> Attach
          {/* Snapshot the FileList before clearing the input — a lazy read inside the updater finds it emptied. */}
          <input type="file" accept="image/*,.pdf,.doc,.docx" multiple className="hidden" onChange={e => { const picked = Array.from(e.target.files ?? []); setFiles(p => [...p, ...picked].slice(0, MAX_FILES)); setErr(''); e.currentTarget.value = '' }} />
        </label>
        <button onClick={submit} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50">
          {busy ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Send size={14} /> Send</>}
        </button>
      </div>
    </div>
  )
}

// RM-only participants bar: pull the ticket's Store Manager(s) into the chat
// (choosing whether they see the full history or only from now), or remove them.
function SmParticipantBar({ ticketId, smAdded, onChanged }: { ticketId: string; smAdded: boolean; onChanged: () => void }) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function act(payload: { action: 'add_sm'; history: 'full' | 'from_now' } | { action: 'remove_sm' }) {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/tickets/${ticketId}/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Failed')
      setPicking(false); onChanged()
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="rounded-xl bg-[var(--surface-2)] px-3 py-2 ring-1 ring-[var(--border)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 text-xs text-[var(--text-muted)]">
          {smAdded ? 'The store manager is in this conversation.' : 'The store manager is not in this conversation.'}
        </span>
        {busy ? <Loader2 size={14} className="shrink-0 animate-spin text-[var(--text-faint)]" />
          : smAdded ? (
            <button type="button" onClick={() => act({ action: 'remove_sm' })} className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-500/40 transition hover:bg-red-500/10 dark:text-red-400">Remove</button>
          ) : (
            <button type="button" onClick={() => setPicking(p => !p)} className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500">Add store manager</button>
          )}
      </div>
      {picking && !smAdded && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="w-full text-[11px] text-[var(--text-faint)]">What should they see?</span>
          <button type="button" disabled={busy} onClick={() => act({ action: 'add_sm', history: 'full' })} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">Full history</button>
          <button type="button" disabled={busy} onClick={() => act({ action: 'add_sm', history: 'from_now' })} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">Only from now on</button>
        </div>
      )}
      {err && <p className="mt-1.5 text-xs text-red-500">{err}</p>}
    </div>
  )
}

// Floating chat button for the ticket-detail pages: fixed bottom-right, above the
// mobile bottom tab bar (sm: has no bottom nav → sits at the corner), with an
// unread-count badge. A client wrapper so Server Components can drop it in.
export function ChatFab({ ticketId, viewerRole, unreadCount = 0 }: { ticketId: string; viewerRole: ChatViewerRole; unreadCount?: number }) {
  return (
    <TicketChat ticketId={ticketId} viewerRole={viewerRole} trigger={open => (
      <button type="button" onClick={open} aria-label="Open the ticket chat"
        className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-[52px] w-[52px] place-items-center rounded-full bg-blue-600 text-white shadow-lg shadow-black/25 transition hover:bg-blue-500 sm:bottom-6 sm:right-6">
        <MessageSquare size={22} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[var(--app-bg)]">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    )} />
  )
}
