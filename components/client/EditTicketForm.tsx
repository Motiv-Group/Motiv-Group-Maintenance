'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { Pencil, Trash2, X, AlertTriangle } from 'lucide-react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import type { Ticket, Priority } from '@/lib/types'

interface EditForm {
  title: string
  description: string
  priority: Priority
}

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'low',    label: 'Low',    color: 'border-green-400 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' },
  { value: 'medium', label: 'Medium', color: 'border-yellow-400 bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' },
  { value: 'high',   label: 'High',   color: 'border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400' },
  { value: 'urgent', label: 'Urgent', color: 'border-red-400 bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400' },
]

export function EditTicketForm({ ticket }: { ticket: Ticket }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<EditForm>({
    defaultValues: {
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority,
    },
  })
  const priority = watch('priority')

  async function onSave(values: EditForm) {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) {
      const d = await res.json()
      setError(d.error ?? 'Failed to save')
      setSaving(false)
      return
    }
    setSaving(false)
    setEditing(false)
    router.refresh()
  }

  async function onDelete() {
    setDeleting(true)
    const res = await fetch(`/api/tickets/${ticket.id}`, { method: 'DELETE' })
    if (!res.ok) {
      setDeleting(false)
      return
    }
    router.push('/client/tickets')
  }

  if (!editing) {
    return (
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setEditing(true)}
          className="flex-1"
        >
          <Pencil size={14} className="mr-1.5" /> Edit Ticket
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          className="flex-1"
        >
          <Trash2 size={14} className="mr-1.5" /> Delete
        </Button>

        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-50 dark:bg-gray-800 rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                  <AlertTriangle size={20} className="text-red-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">Delete ticket?</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">This cannot be undone.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  loading={deleting}
                  onClick={onDelete}
                  className="flex-1"
                >
                  Yes, delete
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-brand-200 dark:border-brand-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Pencil size={15} className="text-brand-600" /> Edit Ticket
        </h3>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSave)} className="space-y-4">
        <Input
          id="edit-title"
          label="Title"
          error={errors.title?.message}
          {...register('title', { required: 'Title is required' })}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            rows={3}
            {...register('description', { required: 'Description is required' })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</label>
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                type="button"
                onClick={() => setValue('priority', p.value)}
                className={`py-1.5 rounded-lg border-2 text-xs font-medium transition-all ${
                  priority === p.value ? p.color : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" loading={saving} size="sm" className="flex-1">Save Changes</Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(false)} className="flex-1">Cancel</Button>
        </div>
      </form>
    </div>
  )
}
