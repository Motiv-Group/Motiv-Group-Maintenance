'use client'

// Store-manager "Next action" cluster: the primary action (Edit ticket) inline,
// with secondary/destructive actions (Delete) tucked into a "More" menu — the
// same pattern the RM and Supplier ticket pages use.
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { MoreMenu, MoreActionItem } from '@/components/regional/rm-actions/ticket'
import { EditTicketModal } from '@/components/client/EditTicketModal'
import { DeleteTicketButton } from '@/components/client/DeleteTicketButton'

export function ClientTicketActions({ ticketId, title, description, category, impact, photoUrls }: {
  ticketId: string
  title: string
  description: string
  category: string
  impact: string
  photoUrls: string[]
}) {
  const [del, setDel] = useState(false)
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <EditTicketModal ticketId={ticketId} title={title} description={description} category={category} impact={impact} photoUrls={photoUrls} />
        </div>
        <MoreMenu>
          <MoreActionItem icon={<Trash2 size={16} />} label="Delete ticket" tone="danger" onClick={() => setDel(true)} />
        </MoreMenu>
      </div>
      {/* Confirm dialog opens immediately; the trigger renders nothing (the menu item is the trigger). */}
      {del && <DeleteTicketButton ticketId={ticketId} defaultOpen trigger={() => null} onClose={() => setDel(false)} />}
    </div>
  )
}
