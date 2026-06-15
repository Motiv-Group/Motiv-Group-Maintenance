'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Trash2, AlertTriangle } from 'lucide-react'

export function SupplierDeleteButton({ supplierId }: { supplierId: string }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await fetch(`/api/suppliers/${supplierId}`, { method: 'DELETE' })
    router.push('/supplier/suppliers')
    router.refresh()
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="w-full flex items-center justify-center gap-2 text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 py-3 transition-colors"
      >
        <Trash2 size={14} /> Delete Supplier
      </button>
    )
  }

  return (
    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
        <AlertTriangle size={15} />
        <p className="text-sm font-medium">This will permanently delete this supplier. Are you sure?</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleDelete} loading={deleting} variant="danger" size="sm" className="flex-1">
          Yes, Delete
        </Button>
        <Button onClick={() => setConfirming(false)} variant="secondary" size="sm" className="flex-1" disabled={deleting}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
