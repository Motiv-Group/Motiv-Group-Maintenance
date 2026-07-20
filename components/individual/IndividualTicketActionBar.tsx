'use client'

// Individual ticket-page action cluster — mirrors RmTicketActionBar's pattern:
// one primary blue button (Assign supplier, the phase control while the job is
// still assignable) + a "More" dropdown holding the secondary/destructive
// actions (chat with the awarded supplier, cancel). When the phase has no
// primary, the remaining actions render as outline buttons instead of a lone
// "More" chip. The modals are SIBLINGS driven by lifted state so they open
// instantly (same approach as the RM bar).
import { useState } from 'react'
import { MessageSquare, XCircle } from 'lucide-react'
import { AssignSuppliersButton, MoreMenu, MoreActionItem, CancelTicketCard } from '@/components/regional/RmTicketActions'
import { TicketChat } from '@/components/chat/TicketChat'
import type { SupplierChoice } from '@/components/regional/rm-actions/shared'

type ActionKey = 'chat' | 'cancel'

export function IndividualTicketActionBar({ ticketId, canAssign, hasSupplier, canCancel, motivSuppliers, declinedSupplierIds, awaitingById }: {
  ticketId: string
  canAssign: boolean
  hasSupplier: boolean
  canCancel: boolean
  motivSuppliers: SupplierChoice[]
  declinedSupplierIds: string[]
  awaitingById: Record<string, 'invited' | 'quoted'>
}) {
  const [active, setActive] = useState<ActionKey | null>(null)
  const done = () => setActive(null)
  const hasMenu = hasSupplier || canCancel
  const primaryCls = `${hasMenu ? 'flex-1' : 'w-full'} py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition`
  // Once one or more suppliers have already been invited/quoted, assigning is
  // adding ANOTHER supplier — reflect that in the button label.
  const assignLabel = Object.keys(awaitingById).length > 0 ? 'Request another supplier' : 'Assign supplier'
  // With no primary action a lone floating "More" chip looks broken — surface the
  // remaining actions as outline buttons instead (chat also lives on the FAB).
  const outlineCls = 'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-[var(--border)] text-[var(--text)] hover:bg-[var(--hover)] transition'
  const outlineDangerCls = 'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 ring-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 transition'
  return (
    <>
      {canAssign ? (
        <div className="flex items-center gap-2">
          <AssignSuppliersButton ticketId={ticketId} suppliers={[]} motivSuppliers={motivSuppliers} declinedSupplierIds={declinedSupplierIds} awaitingById={awaitingById}
            trigger={open => <button onClick={open} className={primaryCls}>{assignLabel}</button>} />
          {hasMenu && (
            <MoreMenu align="left">
              {hasSupplier && <MoreActionItem icon={<MessageSquare size={16} />} label="Chat with supplier" onClick={() => setActive('chat')} />}
              {canCancel && <MoreActionItem icon={<XCircle size={16} />} label="Cancel ticket" tone="danger" onClick={() => setActive('cancel')} />}
            </MoreMenu>
          )}
        </div>
      ) : hasMenu ? (
        <div className="flex flex-wrap items-center gap-2">
          {hasSupplier && <button onClick={() => setActive('chat')} className={outlineCls}><MessageSquare size={15} /> Chat with supplier</button>}
          {canCancel && <button onClick={() => setActive('cancel')} className={outlineDangerCls}><XCircle size={15} /> Cancel ticket</button>}
        </div>
      ) : null}

      {/* Action modals — mounted only while active, so they appear instantly. */}
      {active === 'chat' && <TicketChat defaultOpen onClose={done} ticketId={ticketId} viewerRole="individual" />}
      {active === 'cancel' && <CancelTicketCard defaultOpen onClose={done} ticketId={ticketId} />}
    </>
  )
}
