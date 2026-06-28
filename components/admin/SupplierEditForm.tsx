'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { AlertCircle } from 'lucide-react'
import { isValidEmail, isValidPhone } from '@/lib/csv'
import type { Supplier } from '@/lib/types'

const TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Painting', 'Carpentry', 'Tiling', 'Roofing', 'General', 'Other']

export function SupplierEditForm({ supplier }: { supplier: Supplier }) {
  const router = useRouter()
  const [form, setForm] = useState({
    company_name:         supplier.company_name,
    contact_name:         supplier.contact_name ?? '',
    email:                supplier.email ?? '',
    phone:                supplier.phone ?? '',
    address:              supplier.address ?? '',
    trade:                supplier.trade ?? '',
    qualified:            supplier.qualified,
    qualification_number: supplier.qualification_number ?? '',
    qualification_expiry: supplier.qualification_expiry ?? '',
    vat_number:           supplier.vat_number ?? '',
    notes:                supplier.notes ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) { setError('Company name is required'); return }
    if (form.email.trim() && !isValidEmail(form.email)) { setError('Please enter a valid email address'); return }
    if (form.phone.trim() && !isValidPhone(form.phone)) { setError('Please enter a valid phone number'); return }
    setSaving(true)
    setError('')

    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setError(json.error ?? 'Failed to save'); return }
    router.push(`/supplier/suppliers/${supplier.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Company Details</p>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Company Name <span className="text-red-500">*</span></label>
          <Input value={form.company_name} onChange={e => set('company_name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trade / Specialty</label>
          <select value={form.trade} onChange={e => set('trade', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="">Select trade…</option>
            {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">VAT Number</label>
          <Input value={form.vat_number} onChange={e => set('vat_number', e.target.value)} />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Details</p>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contact Person</label>
          <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
          <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
          <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address</label>
          <textarea value={form.address} onChange={e => set('address', e.target.value)} rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Qualification</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={form.qualified} onChange={e => set('qualified', e.target.checked)}
            className="w-4 h-4 accent-brand-600 rounded" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Qualified / Certified</span>
        </label>
        {form.qualified && (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qualification / Registration Number</label>
              <Input value={form.qualification_number} onChange={e => set('qualification_number', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expiry Date</label>
              <Input type="date" value={form.qualification_expiry} onChange={e => set('qualification_expiry', e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</label>
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none" />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
          <AlertCircle size={14} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      <Button type="submit" loading={saving} className="w-full bg-brand-600 hover:bg-brand-700 text-white">
        Save Changes
      </Button>
    </form>
  )
}
