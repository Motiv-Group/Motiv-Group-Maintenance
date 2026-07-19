'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck, Download, Trash2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * POPIA "Privacy & your data" controls: download-my-data (DSAR), links to the
 * privacy/terms pages, and an irreversible account-deletion flow gated behind a
 * typed confirmation.
 */
export function DataPrivacySection() {
  const router = useRouter()
  const [exporting, setExporting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  async function handleExport() {
    setExporting(true)
    setError('')
    try {
      const res = await fetch('/api/account/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'motiv-data.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Could not export your data. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError('')
    const res = await fetch('/api/account/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: 'DELETE' }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not delete your account.')
      setDeleting(false)
      return
    }
    // Anonymised + signed out server-side — send them to login.
    router.push('/auth/login')
  }

  return (
    <div className="bg-slate-50 dark:bg-gray-800 border border-[var(--border)] dark:border-gray-700 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck size={16} className="text-blue-600 dark:text-blue-400" />
        <h2 className="font-semibold text-gray-900 dark:text-white text-sm">Privacy &amp; your data</h2>
      </div>

      <div className="space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Read our{' '}
          <Link href="/privacy" className="text-blue-600 dark:text-blue-400 underline">privacy policy</Link>
          {' '}and{' '}
          <Link href="/terms" className="text-blue-600 dark:text-blue-400 underline">terms of service</Link>.
        </p>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-200">Download my data</p>
            <p className="text-xs text-gray-400 mt-0.5">A copy of the personal data we hold, as JSON.</p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
          >
            <Download size={16} className="text-blue-600 dark:text-blue-400" />
            {exporting ? 'Preparing…' : 'Download'}
          </button>
        </div>

        <div className="border-t border-[var(--border)] dark:border-gray-700 pt-4">
          {!confirmOpen ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-gray-700 dark:text-gray-200">Delete my account</p>
                <p className="text-xs text-gray-400 mt-0.5">Removes your personal details and disables sign-in.</p>
              </div>
              <button
                onClick={() => setConfirmOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 dark:border-red-800 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 size={16} />
                Delete
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>
                  This is permanent. Your name, email and phone number will be erased and you will no longer be able
                  to sign in. Type <span className="font-mono font-semibold">DELETE</span> to confirm.
                </p>
              </div>
              <input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDelete}
                  loading={deleting}
                  disabled={confirmText !== 'DELETE'}
                  variant="danger"
                >
                  Permanently delete
                </Button>
                <button
                  onClick={() => { setConfirmOpen(false); setConfirmText(''); setError('') }}
                  className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
