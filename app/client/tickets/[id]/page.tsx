export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Image from 'next/image'
import { BackButton } from '@/components/ui/BackButton'
import { Clock, CheckCircle, FileText, XCircle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { EditTicketForm } from '@/components/client/EditTicketForm'
import {
  STATUS_COLORS, STATUS_LABELS,
  PRIORITY_COLORS, PRIORITY_LABELS,
  formatDate, clientVisibleStatus, formatJobId,
} from '@/lib/utils'
import type { Ticket } from '@/lib/types'

// Store managers only see a simplified Open → In Progress → Completed track.
const STATUS_STEPS = [
  { key: 'open',        label: 'Submitted',   icon: FileText    },
  { key: 'in_progress', label: 'In Progress', icon: Clock       },
  { key: 'completed',   label: 'Completed',   icon: CheckCircle },
]

export default async function ClientTicketDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: ticket } = await supabase
    .from('tickets')
    .select('*')
    .eq('id', params.id)
    .eq('client_id', user!.id)
    .single()

  if (!ticket) notFound()

  const t = ticket as Ticket
  // Collapse the real status to what the store manager may see.
  const view        = clientVisibleStatus(t.status)   // 'open' | 'in_progress' | 'completed' | null (cancelled)
  const badgeStatus = view ?? 'cancelled'
  const isEditable  = t.status === 'open'              // only a brand-new ticket (no quote yet) is editable
  const showTracker = view === 'open' || view === 'in_progress'
  const currentStep = STATUS_STEPS.findIndex(s => s.key === view)

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white truncate">{t.title}</h1>
          {formatJobId(t.job_number) && <p className="text-xs font-mono text-gray-400 dark:text-gray-500">{formatJobId(t.job_number)}</p>}
        </div>
      </div>

      {/* Progress tracker — only for the linear happy-path statuses */}
      {showTracker && (
        <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Progress</p>
          <div className="flex items-center">
            {STATUS_STEPS.map((step, i) => {
              const done    = i < currentStep
              const current = i === currentStep
              const last    = i === STATUS_STEPS.length - 1
              return (
                <div key={step.key} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center gap-1 min-w-0">
                    <div className={
                      'w-7 h-7 rounded-full flex items-center justify-center shrink-0 ' +
                      (done    ? 'bg-brand-600 text-white' :
                       current ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-900/40' :
                                 'bg-gray-100 dark:bg-gray-700 text-gray-400')
                    }>
                      <step.icon size={13} />
                    </div>
                    <p className={
                      'text-xs text-center leading-tight ' +
                      (current ? 'text-brand-600 dark:text-brand-400 font-semibold' :
                       done    ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400')
                    }>{step.label}</p>
                  </div>
                  {!last && (
                    <div className={
                      'flex-1 h-0.5 mx-1 mb-4 rounded ' +
                      (done ? 'bg-brand-600' : 'bg-gray-200 dark:bg-gray-700')
                    } />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ticket details */}
      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">{formatDate(t.created_at)}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Badge className={PRIORITY_COLORS[t.priority]}>{PRIORITY_LABELS[t.priority]}</Badge>
            <Badge className={STATUS_COLORS[badgeStatus]}>{STATUS_LABELS[badgeStatus]}</Badge>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{t.description}</p>
        </div>
        {t.photo_urls?.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Photos</p>
            <div className="grid grid-cols-3 gap-2">
              {t.photo_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                  <Image
                    src={url}
                    alt=""
                    width={300}
                    height={300}
                    sizes="(max-width: 512px) 33vw, 170px"
                    className="aspect-square object-cover rounded-lg w-full"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Status banner — collapsed to the three states a store manager sees */}
      {view === 'open' && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4 flex items-center gap-3">
          <Loader2 size={18} className="text-blue-500 shrink-0 animate-spin" />
          <div>
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Being processed</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Your ticket has been received and is being processed. You will be notified once work begins.</p>
          </div>
        </div>
      )}

      {view === 'in_progress' && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-center gap-3">
          <Clock size={18} className="text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Work in progress</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">The maintenance team is currently working on your ticket.</p>
          </div>
        </div>
      )}

      {view === 'completed' && (
        <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={18} className="text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800 dark:text-green-300">All done!</p>
            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">This ticket has been completed and signed off by the regional manager.</p>
          </div>
        </div>
      )}

      {view === null && (
        <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-600 rounded-xl p-4 flex items-center gap-3">
          <XCircle size={18} className="text-gray-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Ticket cancelled</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">This ticket has been cancelled. Contact your administrator if you have questions.</p>
          </div>
        </div>
      )}

      {isEditable && <EditTicketForm ticket={t} />}
    </div>
  )
}
