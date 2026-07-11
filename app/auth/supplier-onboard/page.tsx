'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { isValidEmail, isValidPhone } from '@/lib/csv'
import { TRADES } from '@/lib/trades'
import { SLA_VERSION } from '@/lib/sla'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { MotivLockup } from '@/components/ui/MotivLockup'
import { Truck, ArrowLeft, ArrowRight, Check, FileText } from 'lucide-react'

// Supplier onboarding wizard — 3 steps, two entry paths:
//   invited (?token=…)  → email locked to the invite, joins the inviting company
//   self-signup (no token) → standalone Motiv-pool applicant, admin approves later
// Step 3 (SLA signature) is mandatory for both — the account is only created on
// the final submit, by the trusted server route (the signup trigger clamps
// client-side roles, so 'supplier' can only be granted server-side).

type Step = 1 | 2 | 3

const inputCls = 'w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#C6A35D]/50 focus:border-[#C6A35D]/70'

export default function SupplierOnboardPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [checking, setChecking] = useState(true)
  const [invalid, setInvalid] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1 — account
  const [email, setEmail] = useState('')
  const [emailLocked, setEmailLocked] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  // Step 2 — business
  const [companyName, setCompanyName] = useState('')
  const [contactName, setContactName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [trades, setTrades] = useState<Set<string>>(new Set())
  const [vatRegistered, setVatRegistered] = useState(false)
  const [vatNumber, setVatNumber] = useState('')
  // Step 3 — SLA
  const [slaAgreed, setSlaAgreed] = useState(false)
  const [signedName, setSignedName] = useState('')

  // Invited path: validate the token + prefill. No token = self-signup, no error.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-only init from URL query string (invite token); cannot run during SSR render
    setToken(t)
    if (!t) { setChecking(false); return }
    fetch(`/api/supplier/onboard?token=${encodeURIComponent(t)}`)
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (!r.ok) { setInvalid(d.error || 'This invite link is invalid.'); return }
        setEmail(d.email); setEmailLocked(true)
        setCompanyName(d.companyName ?? '')
        if (Array.isArray(d.trades) && d.trades.length) setTrades(new Set(d.trades))
        else if (d.trade) setTrades(new Set([d.trade]))
      })
      .finally(() => setChecking(false))
  }, [])

  const toggleTrade = (t: string) => setTrades(s => { const n = new Set(s); n.has(t) ? n.delete(t) : n.add(t); return n })

  function validateStep(s: Step): string {
    if (s === 1) {
      if (!isValidEmail(email)) return 'Enter a valid email address.'
      if (password.length < 8) return 'Password must be at least 8 characters.'
      if (password !== confirm) return 'Passwords do not match.'
    }
    if (s === 2) {
      if (!companyName.trim()) return 'Company name is required.'
      if (!contactName.trim()) return 'Contact person is required.'
      if (!isValidPhone(phone)) return 'Enter a valid phone number.'
      if (!trades.size) return 'Select at least one trade.'
      if (vatRegistered && !/^4\d{9}$/.test(vatNumber.replace(/\s+/g, ''))) return 'Enter a valid VAT number (10 digits, starting with 4).'
    }
    if (s === 3) {
      if (!slaAgreed) return 'Tick the box to accept the Service Level Agreement.'
      if (!signedName.trim()) return 'Type your full name as your signature.'
    }
    return ''
  }

  function next() {
    const err = validateStep(step)
    if (err) { setError(err); return }
    setError(''); setStep((step + 1) as Step)
  }

  async function submit() {
    const err = validateStep(3)
    if (err) { setError(err); return }
    setLoading(true); setError('')
    const res = await fetch('/api/supplier/onboard', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: token || undefined, email,
        password, company_name: companyName, contact_name: contactName,
        phone, address, trades: [...trades],
        vat_registered: vatRegistered, vat_number: vatNumber,
        sla_agreed: slaAgreed, sla_signed_name: signedName,
      }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d.error || 'Could not create your account.'); setLoading(false); return }

    // Sign straight in with the password they just chose.
    const supabase = createClient()
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: d.email, password })
    if (signInErr) { router.push('/auth/login'); return }
    router.push('/supplier'); router.refresh()
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0b0c11] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#C6A35D]" />
      </div>
    )
  }

  if (invalid) {
    return (
      <Shell>
        <div className="text-center space-y-4">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Invite link problem</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{invalid}</p>
          <Link href="/auth/login" className="inline-block rounded-xl bg-[#C6A35D] px-5 py-2.5 font-medium text-[#0a0e17] hover:opacity-90 transition-opacity">Go to login</Link>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-center gap-2 mb-1">
        <Truck size={20} className="text-[#C6A35D]" />
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Supplier registration</h1>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
        {token ? 'You were invited to join Motiv as a supplier.' : 'Register your trade company on Motiv. Your account is reviewed before you receive work.'}
      </p>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {([1, 2, 3] as const).map(s => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              s < step ? 'bg-emerald-500 text-white' : s === step ? 'bg-[#C6A35D] text-[#0a0e17]' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
            }`}>{s < step ? <Check size={14} /> : s}</div>
            <span className={`text-xs ${s === step ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-400'} hidden sm:block`}>
              {s === 1 ? 'Account' : s === 2 ? 'Business details' : 'Agreement'}
            </span>
            {s < 3 && <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <L label="Email Address">
            <input type="email" className={`${inputCls} ${emailLocked ? 'opacity-60 cursor-not-allowed' : ''}`} value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@company.co.za" disabled={emailLocked} required />
            {emailLocked && <p className="text-[11px] text-gray-400 mt-1">Locked to your invite.</p>}
          </L>
          <PasswordInput id="password" label="Password" placeholder="Minimum 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
          <PasswordInput id="confirm" label="Confirm Password" placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <L label="Company Name"><input className={inputCls} value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Jozi Electrical Services (Pty) Ltd" required /></L>
          <L label="Contact Person"><input className={inputCls} value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Full name" required /></L>
          <L label="Phone Number"><input type="tel" className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+27 71 234 5678" required /></L>
          <L label="Business Address"><input className={inputCls} value={address} onChange={e => setAddress(e.target.value)} placeholder="Street, suburb, city" /></L>

          <L label="Trades" hint="(select all that apply)">
            <div className="flex flex-wrap gap-2">
              {TRADES.map(t => (
                <button key={t} type="button" onClick={() => toggleTrade(t)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition ${
                    trades.has(t)
                      ? 'bg-[#C6A35D] text-[#0a0e17] border-[#C6A35D] font-medium'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-[#C6A35D]/60'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </L>

          <div className="rounded-xl border border-gray-200 dark:border-white/10 p-3.5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium text-gray-900 dark:text-white">VAT registered?</span>
              <input type="checkbox" checked={vatRegistered} onChange={e => setVatRegistered(e.target.checked)} className="h-5 w-5 accent-[#C6A35D]" />
            </label>
            {vatRegistered && (
              <div className="mt-3">
                <input className={inputCls} value={vatNumber} onChange={e => setVatNumber(e.target.value)} placeholder="VAT number — 10 digits, starts with 4" inputMode="numeric" />
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 dark:border-white/10 p-4 max-h-64 overflow-y-auto text-sm text-gray-600 dark:text-gray-300 space-y-2">
            <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5"><FileText size={15} /> Service Level Agreement — key commitments (v{SLA_VERSION})</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Respond, attend and resolve jobs within the P1–P4 priority windows measured by the platform.</li>
              <li>Make safe on first attendance for emergencies (P1).</li>
              <li>Quotes are binding; no work before client approval (except make-safe).</li>
              <li>Every job closes with before/after photos, a COC where regulated, and the invoice.</li>
              <li>Workmanship snags are reworked at no charge within the agreed window.</li>
              <li>Variations are approved on the platform before extra work is done.</li>
              <li>Licences, insurance and (if registered) VAT details are kept current.</li>
              <li>Sustained SLA breaches or material breach can suspend or remove your account.</li>
            </ul>
            <p>
              Read the full agreement: <Link href="/sla" target="_blank" className="text-[#C6A35D] underline">Supplier Service Level Agreement</Link>.
              Your acceptance is recorded electronically (name, version, date, time).
            </p>
          </div>

          <L label="Type your full name as signature">
            <input className={inputCls} value={signedName} onChange={e => setSignedName(e.target.value)} placeholder="Full name" required />
          </L>

          <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-gray-200 dark:border-white/10 p-3.5">
            <input type="checkbox" checked={slaAgreed} onChange={e => setSlaAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#C6A35D]" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              I have read and agree to the <Link href="/sla" target="_blank" className="text-[#C6A35D] underline">Service Level Agreement</Link> (v{SLA_VERSION}) on behalf of {companyName.trim() || 'my company'}.
            </span>
          </label>
        </div>
      )}

      {error && <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">{error}</div>}

      <div className="mt-6 flex items-center justify-between gap-3">
        {step > 1 ? (
          <button type="button" onClick={() => { setError(''); setStep((step - 1) as Step) }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition">
            <ArrowLeft size={15} /> Back
          </button>
        ) : <span />}
        {step < 3 ? (
          <button type="button" onClick={next}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#C6A35D] px-5 py-2.5 text-sm font-semibold text-[#0a0e17] hover:opacity-90 transition-opacity">
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#C6A35D] px-5 py-2.5 text-sm font-semibold text-[#0a0e17] hover:opacity-90 transition-opacity disabled:opacity-60">
            {loading ? 'Creating your account…' : 'Sign & create account'}
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Already have an account? <Link href="/auth/login" className="text-[#C6A35D] hover:underline font-medium">Log in</Link>
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-[#0b0c11] flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center mb-8"><MotivLockup height={92} /></div>
        <div className="bg-slate-50 dark:bg-[#1f2027] rounded-2xl shadow-sm border border-gray-200 dark:border-white/10 p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
        {label}{hint && <span className="text-gray-400 font-normal"> {hint}</span>}
      </label>
      {children}
    </div>
  )
}
