'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { CheckCircle2 } from 'lucide-react'

export function StoreBudgetForm({
  storeId,
  current,
}: {
  storeId: string
  current: number | null
}) {
  const router = useRouter()
  const [value,   setValue]   = useState(current != null ? String(current) : '')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [saved,   setSaved]   = useState(false)

  async function save() {
    setError(''); setSaved(false)
    if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
      setError('Enter a valid amount (or leave blank to clear).')
      return
    }
    setLoading(true)
    const res = await fetch('/api/regional/store-budget', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId, capex_budget: value === '' ? null : Number(value) }),
    })
    setLoading(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Failed to save')
      return
    }
    setSaved(true)
    router.refresh()
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-5 space-y-4 max-w-md">
      <div>
        <Input
          id="capex_budget"
          type="number"
          step="0.01"
          min="0"
          label="Monthly Capex Budget (R)"
          placeholder="0.00"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-400">Recurring allowance applied each month. Leave blank to clear.</p>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {saved && (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 size={16} /> Saved.
        </div>
      )}

      <Button onClick={save} loading={loading} className="w-full">Save Budget</Button>
    </div>
  )
}
