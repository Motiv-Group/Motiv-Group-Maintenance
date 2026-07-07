'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ExternalLink } from 'lucide-react'
import { Card } from '@/components/exec/ui'
import { SLA_VERSION } from '@/lib/sla'

// B12 re-acceptance gate. Rendered by the supplier layout INSTEAD of the page
// content whenever the supplier's latest accepted SLA version isn't the current
// one (or they never accepted — pre-wizard invited suppliers). Blocks all
// supplier work until they re-accept; on success it refreshes so the layout
// re-checks and renders the real page.
export function SlaReacceptGate({ signedNameDefault }: { signedNameDefault: string | null }) {
  const router = useRouter()
  const [name, setName] = useState(signedNameDefault ?? '')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const canSubmit = agreed && name.trim().length > 0 && !busy

  const submit = async () => {
    if (!canSubmit) return
    setErr(null)
    setBusy(true)
    try {
      const res = await fetch('/api/supplier/accept-sla', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sla_agreed: agreed, signed_name: name.trim() }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setErr(b.error ?? 'Could not submit — please try again.')
        setBusy(false)
        return
      }
      router.refresh()
    } catch {
      setErr('Network error — please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto py-8">
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="text-[#C6A35D]" size={22} />
          <h1 className="text-xl font-bold text-[var(--text)]">Service Level Agreement updated</h1>
        </div>
        <p className="text-sm text-[var(--text-muted)]">
          Our Service Level Agreement (version {SLA_VERSION}) needs your acceptance before you can
          take on new work. Please review the full terms, then type your name and accept below.
        </p>

        <a
          href="/sla"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          Read the full Service Level Agreement <ExternalLink size={14} />
        </a>

        <div className="space-y-3 pt-1">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Type your full name"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:ring-2 focus:ring-blue-500/40"
          />
          <label className="flex items-start gap-2 text-sm text-[var(--text)] cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>I have read and accept the Service Level Agreement.</span>
          </label>
        </div>

        {err && <p className="text-sm text-red-600 dark:text-red-400">{err}</p>}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? 'Submitting…' : 'Accept & continue'}
        </button>
      </Card>
    </div>
  )
}
