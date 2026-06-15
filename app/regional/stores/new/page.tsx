'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { BackButton } from '@/components/ui/BackButton'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { parseStoreCSV, STORE_CSV_HEADERS } from '@/lib/csv'
import {
  UserPlus, Upload, CheckCircle2, AlertCircle, FileText, X,
  Download, Copy, Mail, MessageCircle, Check,
} from 'lucide-react'

type Tab = 'single' | 'bulk'

interface SingleForm {
  full_name: string; email: string; phone: string; address: string
  company_name: string; sub_store: string; branch_code: string; password: string
}
const EMPTY: SingleForm = {
  full_name: '', email: '', phone: '', address: '', company_name: '', sub_store: '', branch_code: '', password: '',
}

interface SingleResult {
  store: { company_name: string; sub_store: string }
  loginUrl: string
  emailSent: boolean
  whatsappSent: boolean
  phoneE164: string | null
  shareText: string
  email: string
}

interface BulkRowResult { email: string; status: 'created' | 'skipped' | 'error'; reason?: string }
interface BulkResult { created: number; skipped: number; results: BulkRowResult[] }

export default function NewStoreAccountPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('single')

  // ── Single ──
  const [form, setForm] = useState<SingleForm>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [singleError, setSingleError] = useState('')
  const [result, setResult] = useState<SingleResult | null>(null)
  const [copied, setCopied] = useState(false)

  // ── Bulk ──
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [bulkError, setBulkError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  function set(key: keyof SingleForm, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function submitSingle(e: React.FormEvent) {
    e.preventDefault()
    setSingleError('')
    if (!form.email.trim() || !form.full_name.trim() || !form.branch_code.trim()) {
      setSingleError('Manager name, email and branch code are required.')
      return
    }
    if (form.password.length < 8) { setSingleError('Password must be at least 8 characters.'); return }

    setSaving(true)
    const res = await fetch('/api/regional/invite-store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    setSaving(false)
    if (!res.ok) { setSingleError(json.error ?? 'Failed to create account'); return }
    setResult({ ...json, email: form.email.trim() })
    router.refresh()
  }

  function downloadTemplate() {
    const example = 'Jane Smith,jane@acme.co.za,0712345678,12 Main Rd Cape Town,Acme Retail,Cape Town Branch,CPT001,'
    const csv = `${STORE_CSV_HEADERS.join(',')}\n${example}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'motiv-store-accounts-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setBulkError('')
    setRows([])
    setBulkResult(null)
    const reader = new FileReader()
    reader.onload = ev => {
      const parsed = parseStoreCSV(ev.target?.result as string)
      if (parsed.length === 0) {
        setBulkError('No valid rows found. Make sure the first row has headers including "email".')
        return
      }
      setRows(parsed)
    }
    reader.readAsText(file)
  }

  async function submitBulk() {
    if (rows.length === 0) return
    setUploading(true)
    setBulkError('')
    const res = await fetch('/api/regional/invite-store/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setBulkError(json.error ?? 'Upload failed'); return }
    setBulkResult(json)
    router.refresh()
  }

  async function copyLink() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.shareText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const waHref   = result?.phoneE164
    ? `https://wa.me/${result.phoneE164.replace(/\D/g, '')}?text=${encodeURIComponent(result.shareText)}`
    : ''
  const mailHref = result
    ? `mailto:${result.email}?subject=${encodeURIComponent('Your Motiv account')}&body=${encodeURIComponent(result.shareText)}`
    : ''

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <BackButton />
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Create Store Account</h1>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1 gap-1">
        {(['single', 'bulk'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t === 'single' ? <><UserPlus size={14} /> Single Account</> : <><Upload size={14} /> Bulk Import</>}
          </button>
        ))}
      </div>

      {/* ── SINGLE ── */}
      {tab === 'single' && !result && (
        <form onSubmit={submitSingle} className="space-y-4">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Store Manager</p>
            <Input label="Manager Name" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Jane Smith" />
            <Input label="Email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane@company.com" />
            <Input label="Phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="071 234 5678" />
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Store</p>
            <Input label="Company Name" value={form.company_name} onChange={e => set('company_name', e.target.value)} placeholder="Acme Retail" />
            <Input label="Branch / Sub-Store" value={form.sub_store} onChange={e => set('sub_store', e.target.value)} placeholder="Cape Town Branch" />
            <Input label="Branch Code" value={form.branch_code} onChange={e => set('branch_code', e.target.value.toUpperCase())} placeholder="CPT001" className="font-mono uppercase" />
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Address <span className="text-gray-400 font-normal">(optional)</span></label>
              <textarea
                value={form.address}
                onChange={e => set('address', e.target.value)}
                rows={2}
                placeholder="12 Main Road, Cape Town"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2">
            <PasswordInput label="Initial Password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Minimum 8 characters" />
            <p className="text-xs text-gray-400">The manager can change this after first login. Shared with them in the invite.</p>
          </div>

          {singleError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{singleError}</p>
            </div>
          )}

          <Button type="submit" loading={saving} className="w-full">Create Account &amp; Send Invite</Button>
        </form>
      )}

      {/* ── SINGLE RESULT ── */}
      {tab === 'single' && result && (
        <div className="space-y-4">
          <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 rounded-xl p-5 text-center space-y-2">
            <CheckCircle2 size={32} className="mx-auto text-green-500" />
            <p className="font-semibold text-green-700 dark:text-green-400">
              {result.store.company_name} — {result.store.sub_store} created
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
              <p>{result.emailSent ? '✓ Invite emailed' : '⚠ Email not auto-sent (share manually below)'}</p>
              <p>{result.whatsappSent ? '✓ Invite sent on WhatsApp' : '⚠ WhatsApp not auto-sent (share manually below)'}</p>
            </div>
          </div>

          {/* Manual share fallback */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Share the invite</p>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={copyLink}
                className="flex flex-col items-center gap-1 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-400 text-gray-700 dark:text-gray-200 transition-colors">
                {copied ? <Check size={18} className="text-green-500" /> : <Copy size={18} />}
                <span className="text-xs">{copied ? 'Copied' : 'Copy'}</span>
              </button>
              {waHref ? (
                <a href={waHref} target="_blank" rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-green-400 text-gray-700 dark:text-gray-200 transition-colors">
                  <MessageCircle size={18} className="text-green-600" />
                  <span className="text-xs">WhatsApp</span>
                </a>
              ) : (
                <div className="flex flex-col items-center gap-1 py-3 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-gray-300 dark:text-gray-600">
                  <MessageCircle size={18} />
                  <span className="text-xs">No phone</span>
                </div>
              )}
              <a href={mailHref}
                className="flex flex-col items-center gap-1 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-brand-400 text-gray-700 dark:text-gray-200 transition-colors">
                <Mail size={18} className="text-brand-600" />
                <span className="text-xs">Email</span>
              </a>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1"
              onClick={() => { setResult(null); setForm(EMPTY); setSingleError('') }}>
              Add another
            </Button>
            <Button className="flex-1" onClick={() => router.push('/regional/stores')}>Done</Button>
          </div>
        </div>
      )}

      {/* ── BULK ── */}
      {tab === 'bulk' && (
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800/40 rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-400">How bulk import works</p>
            <p className="text-xs text-blue-600 dark:text-blue-500 leading-relaxed">
              Download the template, fill one store manager per row, then upload it. Columns:{' '}
              <span className="font-mono">full_name, email, phone, company_name, sub_store, branch_code, password</span>.
              Leave <span className="font-mono">password</span> blank to auto-generate a secure one. Each manager is
              emailed their login (and WhatsApp where possible).
            </p>
            <Button size="sm" variant="secondary" onClick={downloadTemplate}>
              <Download size={14} className="mr-1.5" /> Download CSV template
            </Button>
          </div>

          <button type="button" onClick={() => fileRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-brand-400 dark:hover:border-brand-500 transition-colors space-y-2">
            <Upload size={28} className="mx-auto text-gray-400" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{fileName || 'Click to select a CSV file'}</p>
            <p className="text-xs text-gray-400">Accepts .csv (comma or semicolon separated)</p>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />

          {bulkError && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40 rounded-xl px-4 py-3">
              <AlertCircle size={14} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{bulkError}</p>
            </div>
          )}

          {/* Preview */}
          {rows.length > 0 && !bulkResult && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {rows.length} account{rows.length !== 1 ? 's' : ''} ready to create
                </p>
                <button onClick={() => { setRows([]); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X size={16} />
                </button>
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      {['Manager', 'Email', 'Company', 'Branch', 'Code'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white truncate max-w-[110px]">{r.full_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 truncate max-w-[140px]">{r.email}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 truncate max-w-[110px]">{r.company_name || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300 truncate max-w-[110px]">{r.sub_store || '—'}</td>
                        <td className="px-3 py-2 font-mono text-gray-500 dark:text-gray-400">{r.branch_code || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && <p className="text-xs text-gray-400 text-center py-2">+ {rows.length - 50} more rows (all will be created)</p>}
              </div>
              <Button onClick={submitBulk} loading={uploading} className="w-full">
                <FileText size={14} className="mr-1.5" /> Create {rows.length} account{rows.length !== 1 ? 's' : ''}
              </Button>
            </div>
          )}

          {/* Bulk result */}
          {bulkResult && (
            <div className="space-y-3">
              <div className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800/40 rounded-xl p-5 text-center space-y-1">
                <CheckCircle2 size={32} className="mx-auto text-green-500" />
                <p className="font-semibold text-green-700 dark:text-green-400">{bulkResult.created} account{bulkResult.created !== 1 ? 's' : ''} created</p>
                {bulkResult.skipped > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{bulkResult.skipped} row{bulkResult.skipped !== 1 ? 's' : ''} skipped — see below</p>}
              </div>

              {bulkResult.results.some(r => r.status !== 'created') && (
                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {bulkResult.results.filter(r => r.status !== 'created').map((r, i) => (
                        <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-200 truncate max-w-[150px]">{r.email}</td>
                          <td className="px-3 py-2 text-amber-600 dark:text-amber-400">{r.reason ?? r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1"
                  onClick={() => { setBulkResult(null); setRows([]); setFileName(''); if (fileRef.current) fileRef.current.value = '' }}>
                  Import more
                </Button>
                <Button className="flex-1" onClick={() => router.push('/regional/stores')}>Done</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
