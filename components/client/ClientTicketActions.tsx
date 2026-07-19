'use client'

// Store-manager "Next action" cluster: the primary action inline, with
// secondary/destructive actions tucked into a "More" menu — the same pattern
// the RM and Supplier ticket pages use. Two modes share the bar:
//  - 'edit' (default): Edit ticket primary + More (chat / delete)
//  - 'add_info' (status info_requested): the AddInfoModal trigger is the primary
//    blue button + More holds only "Ticket chat" (no delete mid-request)
import { useState } from 'react'
import { MessageSquare, MessageSquarePlus, Trash2 } from 'lucide-react'
import { MoreMenu, MoreActionItem } from '@/components/regional/rm-actions/ticket'
import { AddInfoModal } from '@/components/client/AddInfoModal'
import { EditTicketModal } from '@/components/client/EditTicketModal'
import { DeleteTicketButton } from '@/components/client/DeleteTicketButton'
import { TicketChat } from '@/components/chat/TicketChat'

export function ClientTicketActions({ ticketId, title, description, category, impact, photoUrls, smAdded = false, mode = 'edit', docUrls = [], requestReason = null }: {
  ticketId: string
  title: string
  description: string
  category: string
  impact: string
  photoUrls: string[]
  smAdded?: boolean // RM added the SM to this ticket's chat → show the chat menu item
  mode?: 'edit' | 'add_info'
  docUrls?: string[] // add_info mode: existing info documents (kept on resubmit)
  requestReason?: string | null // add_info mode: what the manager asked for
}) {
  const [del, setDel] = useState(false)
  const [chat, setChat] = useState(false)
  const addInfo = mode === 'add_info'
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {addInfo ? (
            <AddInfoModal
              ticketId={ticketId} title={title} description={description} category={category} impact={impact} photoUrls={photoUrls} docUrls={docUrls} requestReason={requestReason}
              trigger={open => (
                <button
                  type="button"
                  onClick={open}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-500"
                >
                  <MessageSquarePlus size={16} /> Add the requested info
                </button>
              )}
            />
          ) : (
            <EditTicketModal ticketId={ticketId} title={title} description={description} category={category} impact={impact} photoUrls={photoUrls} />
          )}
        </div>
        {(smAdded || !addInfo) && (
          <MoreMenu>
            {smAdded && <MoreActionItem icon={<MessageSquare size={16} />} label="Ticket chat" onClick={() => setChat(true)} />}
            {!addInfo && <MoreActionItem icon={<Trash2 size={16} />} label="Delete ticket" tone="danger" onClick={() => setDel(true)} />}
          </MoreMenu>
        )}
      </div>
      {/* Confirm dialog opens immediately; the trigger renders nothing (the menu item is the trigger). */}
      {del && <DeleteTicketButton ticketId={ticketId} defaultOpen trigger={() => null} onClose={() => setDel(false)} />}
      {/* Chat modal opens immediately too — the menu item above is its trigger. */}
      {chat && <TicketChat ticketId={ticketId} viewerRole="store_manager" defaultOpen onClose={() => setChat(false)} />}
    </div>
  )
}
