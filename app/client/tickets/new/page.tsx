'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { PhotoUploader } from '@/components/ui/PhotoUploader'
import { ArrowLeft } from 'lucide-react'
import type { Priority } from '@/lib/types'

interface TicketForm {
  title: string
  description: string
  priority: Priority
}


const TICKET_CATEGORIES = [
  'General Maintenance',
  'Electrical',
  'Plumbing',
  'Painting',
  'Fixtures',
  'HVAC',
  'Fire Equipment',
  'CCTV',
  'Data Points',
  'Shopfront',
] as const

const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'low',    label: 'Low',    color: 'border-green-400 bg-green-50 text-green-700' },
  { value: 'medium', label: 'Medium', color: 'border-yellow-400 bg-yellow-50 text-yellow-700' },
  { value: 'high',   label: 'High',   color: 'border-orange-400 bg-orange-50 text-orange-700' },
  { value: 'urgent', label: 'Urgent', color: 'border-red-400 bg-red-50 text-red-700' },
]

export default function NewTicketPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<TicketForm>({
    defaultValues: { priority: 'low' },
  })
  const priority = watch('priority')

  function addPhotos(files: File[]) {
    setPhotos(prev => [...prev, ...files])
    setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f))])
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
    setPreviews(prev => prev.filter((_, i) => i !== index))
  }

  async function onSubmit(values: TicketForm) {
    if (photos.length < 2) {
      setError('Please upload at least 2 photos of the issue before submitting.')
      return
    }
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not authenticated'); setLoading(false); return }

    // Upload photos
    const photo_urls: string[] = []
    for (const photo of photos) {
      const ext = photo.name.split('.').pop()
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('ticket-photos')
        .upload(path, photo)
      if (uploadError) { setError('Photo upload failed: ' + uploadError.message); setLoading(false); return }

      const { data: { publicUrl } } = supabase.storage.from('ticket-photos').getPublicUrl(path)
      photo_urls.push(publicUrl)
    }

    // Create ticket via API route
    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, photo_urls }),
    })

    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Failed to create ticket'); setLoading(false); return }

    router.push(`/client/tickets/${data.ticket.id}`)
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">New Maintenance Ticket</h1>
      </div>

      <div className="bg-slate-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Category dropdown */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Category <span className="text-red-500">*</span>
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              {...register('title', { required: 'Please select a category' })}
            >
              <option value="">Select a category…</option>
              {TICKET_CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {errors.title && <p className="mt-1 text-xs text-red-600">{errors.title.message}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-400 resize-none"
              rows={4}
              placeholder="Describe the problem in detail..."
              {...register('description', { required: 'Description is required' })}
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
            )}
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Priority</label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setValue('priority', p.value)}
                  className={`py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                    priority === p.value ? p.color + ' border-opacity-100' : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Photos <span className="text-red-500">*</span>
              <span className="text-gray-400 font-normal ml-1">(minimum 2, up to 5)</span>
            </label>
            <PhotoUploader
              photos={photos}
              previews={previews}
              onAdd={addPhotos}
              onRemove={removePhoto}
              max={5}
              minHint={2}
            />
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Submit Ticket
          </Button>
        </form>
      </div>
    </div>
  )
}

