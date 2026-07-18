// B19 step 2 — side-effect service for the ticket workflow. Takes the admin
// (service-role) client as a parameter and holds the DB fan-out only: no HTTP /
// NextResponse concerns live here. Extracted VERBATIM from
// app/api/tickets/[id]/transition/route.ts (zero behaviour change).
import type { createAdminClient } from '@/lib/supabase/server'
import { sendPushToMany } from '@/lib/push'
import type { Database } from '@/lib/database.types'

type Admin = ReturnType<typeof createAdminClient>
type TicketRow = Database['public']['Tables']['tickets']['Row']

// Durable per-round log → a "Quote requested from <supplier>" audit event.
export async function logQuoteRequest(admin: Admin, ticket: TicketRow, supplierId: string | null | undefined, now: string) {
  await admin.from('ticket_quote_requests').insert({ company_id: ticket.company_id, ticket_id: ticket.id, supplier_id: supplierId ?? ticket.supplier_id ?? null, requested_at: now })
}

// Targeted notifications for the moves that need someone else to act next.
export async function notifyNextActors(admin: Admin, ticket: TicketRow, action: string, actorName: string | null, opts?: { scheduleProposed?: boolean; scheduledAt?: string; declineReason?: string | null }) {
  const toSupplier = ['validate', 'request_quote', 'require_assessment', 'request_evidence', 'raise_snag', 'assign_snag', 'approve_variation', 'reject_variation', 'accept_schedule', 'approve_snag', 'decline_snag_schedule', 'approve', 'close_out']
  const toRegion   = ['submit_quote', 'submit_completion', 'submit_variation', 'resolve_snag', 'resubmit', 'accept_snag', 'start_snag']
  // The store manager is told whenever a visit is scheduled / agreed so they can
  // expect the supplier on site.
  const toStore    = ['request_info', 'close_out', 'reject', 'schedule', 'accept_schedule', 'accept_snag']
  const title = ticket.title ?? 'Untitled'
  // Friendlier copy for scheduling moves; everything else uses the action verb.
  const when = opts?.scheduledAt ? new Date(opts.scheduledAt).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }) : null
  const storeMsg = action === 'schedule'
    ? `A supplier visit is scheduled${when ? ` for ${when}` : ''}.`
    : action === 'accept_snag' ? `The snag fix is scheduled${when ? ` for ${when}` : ''}.`
    : action === 'accept_schedule' ? `The visit time is confirmed${when ? ` for ${when}` : ''}.`
    : action === 'reject' ? 'Your ticket has been cancelled.'
    : `Your ticket has been updated: ${action.replace(/_/g, ' ')}.`

  // A custom (beyond-window) proposal also pings the RM to accept it.
  if (action === 'schedule' && opts?.scheduleProposed && ticket.region_id) {
    const { data } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    await push(admin, (data ?? []).map(r => r.user_id), ticket.company_id, ticket.id, title, `A supplier proposed a visit time${when ? ` for ${when}` : ''}. Accept it to confirm.`, `/regional/tickets/${ticket.id}`)
  }

  if (toSupplier.includes(action) && ticket.supplier_id) {
    const { data } = await admin.from('supplier_users').select('user_id').eq('supplier_id', ticket.supplier_id)
    const ids = (data ?? []).map(r => r.user_id)
    const msg = action === 'accept_schedule' ? `The visit time is confirmed${when ? ` for ${when}` : ''}.`
      : action === 'approve_snag' ? 'The snag schedule was approved. You can start the corrective work.'
      : action === 'decline_snag_schedule' ? `The snag schedule was declined${opts?.declineReason ? ` — ${opts.declineReason}` : ''}. Please propose a new date.`
      : action === 'approve_variation' ? 'Your variation order was approved. You can carry on with the work.'
      : action === 'reject_variation' ? 'Your variation order was declined. Please re-submit a revised version or message the manager.'
      : action === 'approve' ? 'Your completion documents were approved. Raise a variation order if you need one, otherwise the job will be closed out.'
      : action === 'close_out' ? 'The job has been completed and closed out.'
      : `${actorName ?? 'A manager'} updated your ticket: ${action.replace(/_/g, ' ')}.`
    await push(admin, ids, ticket.company_id, ticket.id, title, msg, `/supplier/tickets/${ticket.id}`)
  }
  if (toRegion.includes(action) && ticket.region_id) {
    const { data } = await admin.from('regional_users').select('user_id').eq('region_id', ticket.region_id)
    const ids = (data ?? []).map(r => r.user_id)
    // "resubmit" = the store manager supplied the info the RM asked for.
    const regionMsg = action === 'resubmit' ? 'The store manager added the information you requested.'
      : action === 'accept_snag' ? `A snag fix was proposed${when ? ` for ${when}` : ''}. Approve it to confirm.`
      : `This ticket has an update: ${action.replace(/_/g, ' ')}.`
    await push(admin, ids, ticket.company_id, ticket.id, title, regionMsg, `/regional/tickets/${ticket.id}`)
  }
  if (toStore.includes(action) && ticket.created_by && ticket.store_id) {
    await push(admin, [ticket.created_by], ticket.company_id, ticket.id, title, storeMsg, `/client/tickets/${ticket.id}`)
  }
  // Individual-owned standalone ticket (no region/store): the owner plays the RM +
  // store role, so supplier-side actions notify them on their own area.
  if (!ticket.region_id && !ticket.store_id && ticket.created_by && (toRegion.includes(action) || toStore.includes(action))) {
    const owMsg = action === 'submit_quote' ? 'A supplier submitted a quote. Review it when you can.'
      : action === 'submit_completion' ? 'The completion was submitted. Review it and sign off.'
      : action === 'submit_variation' ? 'A variation order was submitted. Review it when you can.'
      : action === 'accept_snag' ? `A snag fix was proposed${when ? ` for ${when}` : ''}. Approve it to confirm.`
      : `Your ticket has an update: ${action.replace(/_/g, ' ')}.`
    await push(admin, [ticket.created_by], ticket.company_id, ticket.id, title, owMsg, `/individual/tickets/${ticket.id}`)
  }
}

async function push(admin: Admin, ids: string[], companyId: string | null, ticketId: string, title: string, message: string, link: string) {
  if (!ids.length) return
  await admin.from('notifications').insert(ids.map(id => ({ company_id: companyId, user_id: id, ticket_id: ticketId, type: 'ticket_update', title, message, link })))
  void sendPushToMany(ids, { title, body: message, url: link })
}
