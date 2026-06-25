export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/server'
import { requireRegionalV3 } from '@/lib/health/guard'
import { Card } from '@/components/exec/ui'
import { Stars } from '@/components/ui/Stars'
import { formatDate } from '@/lib/utils'

export default async function SupplierReviewsPage({ params }: { params: { id: string } }) {
  const { companyId } = await requireRegionalV3()
  const admin = createAdminClient()
  const { data: supplier } = await admin.from('suppliers').select('id, company_name, company_id').eq('id', params.id).single()
  if (!supplier || supplier.company_id !== companyId) redirect('/regional')

  const { data: ratingsRaw } = await admin.from('ratings').select('score, comment, created_at').eq('supplier_id', params.id).order('created_at', { ascending: false })
  const rs = (ratingsRaw ?? []) as any[]
  const total = rs.length
  const avg = total ? rs.reduce((s, r) => s + Number(r.score), 0) / total : 0
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: rs.filter(r => Number(r.score) === n).length }))

  return (
    <div className="space-y-5">
      <Link href="/regional" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to dashboard</Link>

      <Card className="p-6">
        <h1 className="text-xl font-bold text-[var(--text)]">{supplier.company_name}</h1>
        <div className="mt-2 flex items-center gap-3">
          <span className="text-3xl font-bold text-[var(--text)]">{avg ? avg.toFixed(1) : '—'}</span>
          <div>
            <Stars value={avg} size={18} showNumber={false} />
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{total} review{total === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1.5 max-w-sm">
          {dist.map(d => (
            <div key={d.n} className="flex items-center gap-2 text-xs">
              <span className="w-3 text-[var(--text-muted)]">{d.n}</span>
              <span className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"><span className="block h-full bg-amber-400 rounded-full" style={{ width: `${total ? (d.c / total) * 100 : 0}%` }} /></span>
              <span className="w-6 text-right text-[var(--text-faint)] tabular-nums">{d.c}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-[var(--text)] mb-3">Reviews</h2>
        {total ? rs.map((r, i) => (
          <div key={i} className="py-3 border-b border-[var(--border)] last:border-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Stars value={Number(r.score)} showNumber={false} />
              <span className="text-[11px] text-[var(--text-faint)]">{formatDate(r.created_at)}</span>
            </div>
            {r.comment && <p className="text-sm text-[var(--text-muted)]">{r.comment}</p>}
          </div>
        )) : <p className="text-sm text-[var(--text-faint)]">No reviews yet.</p>}
      </Card>
    </div>
  )
}
