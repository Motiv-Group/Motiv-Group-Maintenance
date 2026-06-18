export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, UserPlus } from 'lucide-react'
import { requireRegionalV3 } from '@/lib/health/guard'
import { AddStoreManagerForm } from '@/components/regional/AddStoreManagerForm'

export default async function AddStorePage() {
  await requireRegionalV3()

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <Link href="/regional/stores" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to stores</Link>

      <div>
        <h1 className="text-2xl font-bold text-[var(--text)] flex items-center gap-2"><UserPlus className="text-emerald-500" size={22} /> Add Store</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Create a store and its store-manager login. Login details are emailed to the manager.</p>
      </div>

      <AddStoreManagerForm />
    </div>
  )
}
