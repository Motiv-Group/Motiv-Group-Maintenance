'use client'

// Admin → Customize → "Invite & notification emails". Lets a system_admin
// reword the transactional emails the app sends (subject/heading/intro/button/
// footer). Links, the credentials block, the logo and the layout stay locked in
// code — only the wording is editable, with a live preview.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'
import type { AppSettings, EmailCopy, EmailCopyField, EmailKey, EmailOverrides } from '@/lib/settings'
import { EMAIL_COPY_FIELDS, EMAIL_KEYS } from '@/lib/settings'
import { EMAIL_DEFS, SAMPLE_VARS, resolveCopy } from '@/lib/emails/defaults'
import { renderBrandedEmail, renderStoreWelcome, renderSupplierAdded } from '@/lib/email'
import { Field, SaveRow, Section, inputCls, postJson, useAsyncSave } from './shared'

type SettingsResponse = { ok: true; settings: AppSettings }

/** All-6-fields draft per email; '' means "use the built-in default". */
type Draft = Record<EmailKey, EmailCopy>

const MULTILINE: EmailCopyField[] = ['lead', 'sub', 'footerNote']
const FIELD_LABELS: Record<EmailCopyField, string> = {
  subject: 'Subject line',
  heading: 'Heading',
  lead: 'Intro',
  sub: 'Second line',
  ctaLabel: 'Button label',
  footerNote: 'Footer note',
}

function copyFromOverride(o: Partial<EmailCopy> | undefined): EmailCopy {
  const c = {} as EmailCopy
  for (const f of EMAIL_COPY_FIELDS) c[f] = o?.[f] ?? ''
  return c
}

function initDraft(overrides: EmailOverrides): Draft {
  const d = {} as Draft
  for (const key of EMAIL_KEYS) d[key] = copyFromOverride(overrides[key])
  return d
}

// Sample dynamic (non-copy) inputs for the preview — the real links/credentials
// are supplied at send time; here we just want something realistic to render.
const SAMPLE_LINK = '/auth/confirm?t=sample'
const SAMPLE_LOGIN = '/auth/login'
const SAMPLE_MESSAGE = 'Looking forward to working with you — please confirm your details when you get a chance.'

function renderPreviewHtml(key: EmailKey, draft: EmailCopy, base: string): string {
  const copy = resolveCopy(key, draft, SAMPLE_VARS[key])
  const link = `${base}${SAMPLE_LINK}`
  const loginUrl = `${base}${SAMPLE_LOGIN}`
  switch (key) {
    case 'store_welcome':
      return renderStoreWelcome(copy, { email: 'thabo@picknpay.co.za', password: 'Xk7m-Rp2q', loginUrl }).html
    case 'supplier_added':
      return renderSupplierAdded(copy, { loginUrl }).html
    case 'supplier_invite':
      return renderBrandedEmail(copy, {
        base,
        link,
        note: SAMPLE_MESSAGE,
        noteLabel: `Message from ${SAMPLE_VARS.supplier_invite.inviter}`,
      }).html
    default:
      return renderBrandedEmail(copy, { base, link }).html
  }
}

export function EmailsSection({ initialEmails }: { initialEmails: EmailOverrides }) {
  const router = useRouter()
  const [sel, setSel] = useState<EmailKey>('role_invite')
  const [draft, setDraft] = useState<Draft>(() => initDraft(initialEmails))
  const [saved, setSaved] = useState<Draft>(() => initDraft(initialEmails))
  const [focused, setFocused] = useState<EmailCopyField | null>(null)
  const saver = useAsyncSave<SettingsResponse>()

  // Absolute origin so the preview's logo + links resolve inside the srcDoc
  // iframe. Read once on the client (empty on the server → the iframe is
  // suppressHydrationWarning'd so the origin-dependent srcDoc can differ).
  const [origin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin))

  const def = EMAIL_DEFS[sel]
  const cur = draft[sel]
  const dirty = EMAIL_COPY_FIELDS.some((f) => cur[f] !== saved[sel][f])
  const hasOverride = EMAIL_COPY_FIELDS.some((f) => saved[sel][f].trim() !== '')

  const previewHtml = useMemo(() => renderPreviewHtml(sel, cur, origin), [sel, cur, origin])

  function setField(f: EmailCopyField, value: string) {
    setDraft((d) => ({ ...d, [sel]: { ...d[sel], [f]: value } }))
  }

  function insertToken(token: string) {
    const target = focused && def.fields.includes(focused)
      ? focused
      : def.fields.includes('lead') ? 'lead' : def.fields[0]
    setDraft((d) => {
      const existing = d[sel][target]
      const next = existing ? `${existing} ${token}` : token
      return { ...d, [sel]: { ...d[sel], [target]: next } }
    })
  }

  async function persist(copy: EmailCopy) {
    const data = await saver.run(() =>
      postJson<SettingsResponse>('/api/admin/customization', { emails: { [sel]: copy } }),
    )
    if (data) {
      const next = copyFromOverride(data.settings.emails[sel])
      setDraft((d) => ({ ...d, [sel]: next }))
      setSaved((s) => ({ ...s, [sel]: next }))
      router.refresh()
    }
  }

  async function save() {
    await persist(cur)
  }

  async function reset() {
    const cleared = {} as EmailCopy
    for (const f of EMAIL_COPY_FIELDS) cleared[f] = ''
    await persist(cleared)
  }

  return (
    <Section
      icon={<Mail size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Invite &amp; notification emails"
      blurb="Reword the emails the app sends when people are invited or notified. You control the wording only — the links, logins, logo and layout stay fixed. Leave a field blank to use the built-in wording."
    >
      {/* Email picker */}
      <div role="tablist" aria-label="Email to edit" className="flex flex-wrap gap-2">
        {EMAIL_KEYS.map((k) => {
          const active = k === sel
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setSel(k)
                setFocused(null)
              }}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                active
                  ? 'bg-blue-500/10 text-blue-700 ring-1 ring-blue-500 dark:text-blue-300'
                  : 'text-[var(--text-muted)] ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'
              }`}
            >
              {EMAIL_DEFS[k].name}
            </button>
          )
        })}
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-muted)]">{def.description}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Editable fields */}
        <div className="space-y-3">
          {def.fields.map((f) => (
            <Field key={f} label={FIELD_LABELS[f]}>
              {MULTILINE.includes(f) ? (
                <textarea
                  value={cur[f]}
                  onChange={(e) => setField(f, e.target.value)}
                  onFocus={() => setFocused(f)}
                  placeholder={def.defaults[f]}
                  rows={f === 'lead' ? 3 : 2}
                  maxLength={600}
                  className={`${inputCls} resize-y`}
                />
              ) : (
                <input
                  type="text"
                  value={cur[f]}
                  onChange={(e) => setField(f, e.target.value)}
                  onFocus={() => setFocused(f)}
                  placeholder={def.defaults[f]}
                  maxLength={600}
                  className={inputCls}
                />
              )}
            </Field>
          ))}

          {def.placeholders.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Insert:</span>
              {def.placeholders.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertToken(p)}
                  className="rounded-lg bg-[var(--surface-2)] px-2 py-1 font-mono text-[11px] text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]"
                >
                  {p}
                </button>
              ))}
              <span className="w-full text-[11px] leading-snug text-[var(--text-faint)]">
                These are filled in automatically when the email is sent (shown here with example values).
              </span>
            </div>
          )}

          {def.hasCredentials && (
            <p className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-[11px] leading-snug text-[var(--text-muted)] ring-1 ring-[var(--border)]">
              This email also includes the login email + password in a fixed block below your intro.
            </p>
          )}
        </div>

        {/* Live preview */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Preview</span>
          <iframe
            srcDoc={previewHtml}
            sandbox=""
            title="Email preview"
            suppressHydrationWarning
            className="w-full h-[380px] rounded-xl ring-1 ring-[var(--border)] bg-white"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} />
        {hasOverride && (
          <button
            type="button"
            onClick={reset}
            disabled={saver.state === 'saving'}
            className="text-xs font-semibold text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset to default
          </button>
        )}
      </div>
    </Section>
  )
}
