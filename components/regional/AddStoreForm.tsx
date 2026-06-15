'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, CheckCircle, Store } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export function AddStoreForm() {
  const router = useRouter()
  const [open,    setOpen]    = useState(false)
  const [code,    setCode]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/regional/add-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch_code: code }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong.')
      setLoading(false)
      return
    }

    setSuccess(`${data.store.company_name} — ${data.store.sub_store} has been added to your region.`)
    setCode('')
    setLoading(false)
    router.refresh()
    setTimeout(() => { setOpen(false); setSuccess('') }, 2500)
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} size="sm" variant="secondary" className="text-xs px-2.5 py-1 whitespace-nowrap">
        <Plus size={13} className="mr-1" /> Add Store by Branch Code
      </Button>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-brand-200 dark:border-brand-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store size={15} className="text-brand-600" />
          <p className="font-medium text-sm text-gray-900 dark:text-white">Add Store by Branch Code</p>
        </div>
        <button
          onClick={() => { setOpen(false); setError(''); setCode('') }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={16} />
        </button>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        Ask the store manager for their branch code (set during registration or in their Settings).
      </p>

      <form onSubmit={submit} className="flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. CPT001"
          maxLength={20}
          className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 uppercase"
        />
        <Button type="submit" loading={loading} size="sm" disabled={!code.trim()}>
          Add
        </Button>
      </form>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      {success && (
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
          <CheckCircle size={14} /> {success}
        </div>
      )}
    </div>
  )
}
