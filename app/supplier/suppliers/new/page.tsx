'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { UserPlus, Upload, CheckCircle2, AlertCircle, FileText, X } from 'lucide-react'
import { isValidEmail, isValidPhone } from '@/lib/csv'

const TRADES = ['Electrical', 'Plumbing', 'HVAC', 'Painting', 'Carpentry', 'Tiling', 'Roofing', 'General', 'Other']

const CSV_HEADERS = [
  'company_name', 'contact_name', 'email', 'phone', 'address',
  'trade', 'qualified', 'qualification_number', 'qualification_expiry',
  'vat_number', 'notes',
]

type Tab = 'manual' | 'csv'

interface ManualForm {
  company_name: string
  contact_name: string
  email: string
  phone: string
  address: string
  trade: string
  qualified: boolean
  qualification_number: string
  qualification_expiry: string
  vat_number: string
  notes: string
}

const EMPTY: ManualForm = {
  company_name: '', contact_name: '', email: '', phone: '',
  address: '', trade: '', qualified: false,
  qualification_number: '', qualification_expiry: '',
  vat_number: '', notes: '',
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const sep = lines[0].includes(';') ? ';' : ','
  const rawHeaders = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, ''))

  const headerMap: Record<number, string> = {}
  rawHeaders.forEach((h, i) => {
    const match = CSV_HEADERS.find(known => known === h || h.includes(known.split('_')[0]))
    if (match) headerMap[i] = match
  })

  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''))
    const row: Record<string, string> = {}
    Object.entries(headerMap).forEach(([i, key]) => {
      row[key] = cols[Number(i)] ?? ''
    })
    return row
  }).filter(r => r.company_name)
}

export default function NewSupplierPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('manual')

  // Manual form
  const [form, setForm] = useState<ManualForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [manualError, setManualError] = useState('')

  // CSV
  const fileRef = useRef<HTMLInputElement>(null)
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([])
  const [csvFileName, setCsvFileName] = useState('')
  const [csvError, setCsvError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ inserted: number } | null>(null)

  function set(key: keyof ManualForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault()
    if (!form.company_name.trim()) { setManualError('Company name is required'); return }
    if (form.email.trim() && !isValidEmail(form.email)) { setManualError('Please enter a valid email address'); return }
    if (form.phone.trim() && !isValidPhone(form.phone)) { setManualError('Please enter a valid phone number'); return }
    setSaving(true)
    setManualError('')
    const res = await fetch('/api/suppliers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setManualError(json.error ?? 'Failed to save'); return }
    router.push(`/supplier/suppliers/${json.supplier.id}`)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvFileName(file.name)
    setCsvError('')
    setCsvRows([])
    setUploadResult(null)

    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const rows = parseCSV(text)
      if (rows.length === 0) {
        setCsvError('No valid rows found. Make sure the first row has headers including "Company Name".')
        return
      }
      setCsvRows(rows)
    }
    reader.readAsText(file)
  }

  async function submitCSV() {
    if (csvRows.length === 0) return
    setUploading(true)
    setCsvError('')
    const res = await fetch('/api/suppliers/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suppliers: csvRows }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setCsvError(json.error ?? 'Upload failed'); return }
    setUploadResult({ inserted: json.inserted })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Add Sub Supplier</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
        {(['manual', 'csv'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t === 'manual' ? <><UserPlus size={14} /> Manual Entry</> : <><Upload size={14} /> Upload CSV</>}
          </button>
        ))}
      </div>

      {/* ── MANUAL FORM ── */}
      {tab === 'manual' && (
        <form onSubmit={submitManual} className="space-y-4">

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Company Details</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <Input value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="ABC Electrical" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Trade / Specialty</label>
              <select
                value={form.trade}
                onChange={e => set('trade', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select trade…</option>
                {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">VAT Number</label>
              <Input value={form.vat_number} onChange={e => set('vat_number', e.target.value)} placeholder="4123456789" />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact Details</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Contact Person</label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="John Smith" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@abc.com" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
              <Input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="0123456789" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address</label>
              <textarea
                value={form.address}
                onChange={e => set('address', e.target.value)}
                rows={2}
                placeholder="123 Main Road, Johannesburg"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Qualification</p>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.qualified}
                onChange={e => set('qualified', e.target.checked)}
                className="w-4 h-4 accent-brand-600 rounded"
              />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Qualified / Certified</span>
            </label>

            {form.qualified && (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qualification / Registration Number</label>
                  <Input value={form.qualification_number} onChange={e => set('qualification_number', e.target.value)} placeholder="REG-12345" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expiry Date</label>
                  <Input type="date" value={form.qualification_expiry} onChange={e => set('qualification_expiry', e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              placeholder="Any additional notes about this supplier…"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          {manualError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{manualError}</p>
            </div>
          )}

          <Button type="submit" loading={saving} className="w-full bg-brand-600 hover:bg-brand-700 text-white">
            Save Sub Supplier
          </Button>
        </form>
      )}

      {/* ── CSV UPLOAD ── */}
      {tab === 'csv' && (
        <div className="space-y-4">

          {/* Template hint */}
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">Expected CSV columns</p>
            <p className="text-xs text-blue-600 dark:text-blue-500 font-mono leading-relaxed">
              Company Name, Contact Name, Email, Phone, Address, Trade, Qualified (yes/no), Qualification Number, Qualification Expiry (YYYY-MM-DD), VAT Number, Notes
            </p>
          </div>

          {/* File picker */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-brand-400 dark:hover:border-brand-500 transition-colors space-y-2"
          >
            <Upload size={28} className="mx-auto text-gray-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              {csvFileName ? csvFileName : 'Click to select a CSV file'}
            </p>
            <p className="text-xs text-gray-400">Accepts .csv (comma or semicolon separated)</p>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />

          {csvError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{csvError}</p>
            </div>
          )}

          {/* Preview */}
          {csvRows.length > 0 && !uploadResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {csvRows.length} supplier{csvRows.length !== 1 ? 's' : ''} ready to import
                </p>
                <button onClick={() => { setCsvRows([]); setCsvFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={16} />
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-750 sticky top-0">
                    <tr>
                      {['Company', 'Contact', 'Trade', 'Qualified', 'Email'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{row.company_name}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 truncate max-w-[100px]">{row.contact_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.trade || '—'}</td>
                        <td className="px-3 py-2">
                          {['yes','true','1'].includes((row.qualified ?? '').toLowerCase())
                            ? <span className="text-green-600 dark:text-green-400 font-medium">Yes</span>
                            : <span className="text-gray-400">No</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 truncate max-w-[120px]">{row.email || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvRows.length > 50 && (
                  <p className="text-xs text-gray-400 text-center py-2">
                    + {csvRows.length - 50} more rows (all will be imported)
                  </p>
                )}
              </div>

              <Button onClick={submitCSV} loading={uploading} className="w-full bg-brand-600 hover:bg-brand-700 text-white">
                <FileText size={14} className="mr-1.5" />
                Import {csvRows.length} Sub Supplier{csvRows.length !== 1 ? 's' : ''}
              </Button>
            </div>
          )}

          {/* Success */}
          {uploadResult && (
            <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 rounded-xl p-6 text-center space-y-3">
              <CheckCircle2 size={32} className="mx-auto text-green-500" />
              <p className="font-semibold text-green-700 dark:text-green-400">
                {uploadResult.inserted} supplier{uploadResult.inserted !== 1 ? 's' : ''} imported successfully
              </p>
              <button
                onClick={() => router.push('/supplier/suppliers')}
                className="text-sm text-brand-600 dark:text-brand-400 hover:underline"
              >
                View all suppliers →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
