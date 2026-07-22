'use client'

// Admin → Customize. One page of sectioned cards that lets a NON-technical
// owner control the app's look for everyone: name, logo/icons, colours, login
// backgrounds, support contact and default theme. Each section saves on its
// own; the heavy sections (logo, colours) live in ./customization/*.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, Download, ExternalLink, Image as ImageIcon, LayoutGrid, LifeBuoy, Loader2, LogIn, Monitor, Moon, Palette, Paintbrush, Plus, Rocket, Smartphone, Sun, Type, X } from 'lucide-react'
import type { AppSettings } from '@/lib/settings'
import { DEFAULT_INSTALL_ANDROID, DEFAULT_INSTALL_IOS } from '@/lib/settings'
import { formatDate } from '@/lib/utils'
import { Card } from '@/components/exec/ui'
import { DarkTile, Field, SaveRow, Section, inputCls, postForm, postJson, useAsyncSave, validateImage } from '@/components/admin/customization/shared'
import { useFileDrop } from '@/components/ui/useFileDrop'
import { LogoSection } from '@/components/admin/customization/LogoSection'
import { LogoLayoutSection } from '@/components/admin/customization/LogoLayoutSection'
import { ColoursSection } from '@/components/admin/customization/ColoursSection'
import { EmailsSection } from '@/components/admin/customization/EmailsSection'

type SettingsResponse = { ok: true; settings: AppSettings }

type TabKey = 'branding' | 'colours' | 'login' | 'app'
const TABS: { key: TabKey; label: string; icon: typeof Type }[] = [
  { key: 'branding', label: 'Branding', icon: Type },
  { key: 'colours', label: 'Colours', icon: Palette },
  { key: 'login', label: 'Login screen', icon: LogIn },
  { key: 'app', label: 'App & email', icon: LayoutGrid },
]

export function CustomizationClient({ initial }: { initial: AppSettings }) {
  const [tab, setTab] = useState<TabKey>('branding')
  const iconSrc = initial.branding.files['icon-192.png'] ?? '/icon-192.png'
  const symbolSrc = initial.branding.files['symbol.png'] ?? '/brand/motiv-symbol.png'
  const wordmarkSrc = initial.branding.files['wordmark.png'] ?? '/brand/motiv-wordmark.png'
  const lockupSrc = initial.branding.files['lockup.png'] ?? '/brand/motiv-lockup.png'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text)]">
            <Paintbrush size={22} className="text-blue-600 dark:text-blue-400" /> Customize
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Control how the app looks for everyone — name, logo, colours and login screen. Changes apply to all users automatically.
          </p>
        </div>
        <a href="/auth/login" target="_blank" rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text)] ring-1 ring-[var(--border)] transition hover:bg-[var(--hover)]">
          Preview in new tab <ExternalLink size={14} />
        </a>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map(t => {
          const active = tab === t.key
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${
                active ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}>
              <t.icon size={15} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'branding' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <IdentitySection initialName={initial.appName} initialTagline={initial.tagline} iconSrc={iconSrc} />
            <LogoSection initialBranding={initial.branding} />
            <LogoLayoutSection initialLayout={initial.logo} symbolUrl={symbolSrc} wordmarkUrl={wordmarkSrc} lockupUrl={lockupSrc} custom={initial.branding.version != null} />
          </div>
          <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
            <LivePreview appName={initial.appName} iconSrc={iconSrc} wordmarkSrc={wordmarkSrc} lockupSrc={lockupSrc} authButtonColor={initial.authButtonColor} />
            <DeploymentStatus branding={initial.branding} />
          </div>
        </div>
      )}

      {tab === 'colours' && (
        <div className="max-w-4xl">
          <ColoursSection initialColors={initial.colors} initialButtonColor={initial.authButtonColor} appName={initial.appName} symbolSrc={symbolSrc} />
        </div>
      )}

      {tab === 'login' && (
        <div className="max-w-4xl space-y-6">
          <LoginBackgroundsSection initialUrls={initial.authBgUrls} />
          <SupportSection initialEmail={initial.supportEmail} initialPhone={initial.supportPhone} />
        </div>
      )}

      {tab === 'app' && (
        <div className="max-w-4xl space-y-6">
          <AppearanceSection initialTheme={initial.defaultTheme} />
          <MobileAppSection initialAndroid={initial.appInstallAndroid} initialIos={initial.appInstallIos} initialUrl={initial.appDownloadUrl} />
          <EmailsSection initialEmails={initial.emails} branding={initial.branding} />
        </div>
      )}
    </div>
  )
}

/* --------------------------- Live preview (right rail) --------------------- */

function LivePreview({ appName, iconSrc, wordmarkSrc, lockupSrc, authButtonColor }: {
  appName: string
  iconSrc: string
  wordmarkSrc: string
  lockupSrc: string
  authButtonColor: string | null
}) {
  const name = appName.trim() || 'Motiv'
  const btn = authButtonColor || '#2563eb'
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-bold text-[var(--text)]">Live preview</h2>
      <div className="grid grid-cols-2 gap-3">
        {/* Login screen */}
        <div className="space-y-1">
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-xl bg-[#0E1016] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs */}
            <img src={lockupSrc} alt="" className="max-h-6 max-w-[80%] object-contain" />
            <div className="h-1.5 w-16 rounded bg-white/15" />
            <div className="h-4 w-16 rounded" style={{ backgroundColor: btn }} />
          </div>
          <p className="text-center text-[10px] text-[var(--text-faint)]">Login screen</p>
        </div>
        {/* Sidebar header */}
        <div className="space-y-1">
          <div className="flex aspect-[4/3] flex-col gap-1.5 rounded-xl bg-[#0E1016] p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs */}
            <img src={wordmarkSrc} alt="" className="max-h-4 max-w-[70%] object-contain" />
            <div className="mt-1 h-2 w-full rounded bg-white/10" />
            <div className="h-2 w-4/5 rounded bg-white/10" />
          </div>
          <p className="text-center text-[10px] text-[var(--text-faint)]">Sidebar header</p>
        </div>
        {/* Mobile home screen */}
        <div className="space-y-1">
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-slate-700 to-slate-900 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs */}
            <img src={iconSrc} alt="" className="h-9 w-9 rounded-xl" />
            <span className="max-w-full truncate text-[10px] text-white/90">{name}</span>
          </div>
          <p className="text-center text-[10px] text-[var(--text-faint)]">Mobile home screen</p>
        </div>
        {/* Browser tab */}
        <div className="space-y-1">
          <div className="flex aspect-[4/3] items-start rounded-xl bg-[var(--surface-2)] p-3 ring-1 ring-[var(--border)]">
            <div className="flex w-full items-center gap-1.5 rounded-lg bg-[var(--surface)] px-2 py-1.5 ring-1 ring-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs */}
              <img src={iconSrc} alt="" className="h-3.5 w-3.5 rounded-[3px]" />
              <span className="truncate text-[11px] text-[var(--text)]">{name}</span>
              <X size={10} className="ml-auto shrink-0 text-[var(--text-faint)]" />
            </div>
          </div>
          <p className="text-center text-[10px] text-[var(--text-faint)]">Browser tab</p>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------- Deployment status (right rail) ------------------ */

function DeploymentStatus({ branding }: { branding: AppSettings['branding'] }) {
  const custom = branding.version != null
  const appliedOn = custom && branding.version != null && branding.version > 1e11
    ? formatDate(new Date(branding.version).toISOString())
    : null
  const rows: { label: string; hint: string; state: 'active' | 'ready' | 'pending'; icon: typeof Rocket }[] = [
    { label: 'Web & PWA', hint: 'Updated automatically', state: 'active', icon: Rocket },
    { label: 'Android package', hint: branding.zipUrl ? 'Included in the asset pack (zip)' : 'Upload a logo to generate', state: branding.zipUrl ? 'ready' : 'pending', icon: Smartphone },
    { label: 'Code repository', hint: 'Manual update required', state: 'pending', icon: Download },
  ]
  const badge = (s: 'active' | 'ready' | 'pending') =>
    s === 'active' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : s === 'ready' ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
    : 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
  const badgeText = (s: 'active' | 'ready' | 'pending') => s === 'active' ? 'Active' : s === 'ready' ? 'Ready' : 'Pending'

  return (
    <Card className="p-4">
      <h2 className="mb-1 text-sm font-bold text-[var(--text)]">Deployment status</h2>
      <p className="mb-3 text-[11px] text-[var(--text-muted)]">Web + PWA apply instantly. The Android app and code repo pick up new branding from the asset pack on their next rebuild.</p>
      <div className="space-y-2">
        {rows.map(r => (
          <div key={r.label} className="flex items-center gap-2.5 rounded-xl bg-[var(--surface-2)] px-3 py-2.5 ring-1 ring-[var(--border)]">
            <r.icon size={15} className="shrink-0 text-[var(--text-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--text)]">{r.label}</p>
              <p className="text-[11px] text-[var(--text-faint)]">{r.hint}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge(r.state)}`}>{badgeText(r.state)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        {custom
          ? <><CheckCircle2 size={13} className="text-emerald-500" /> Custom branding active{appliedOn ? ` since ${appliedOn}` : ''}.</>
          : <>Using the built-in Motiv branding.</>}
      </div>
      {branding.zipUrl && (
        <a href={branding.zipUrl} download className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500">
          <Download size={15} /> Download asset pack (.zip)
        </a>
      )}
    </Card>
  )
}

/* -------------------------------- 1. Identity ------------------------------ */

function IdentitySection({ initialName, initialTagline, iconSrc }: {
  initialName: string
  initialTagline: string
  iconSrc: string
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [tagline, setTagline] = useState(initialTagline)
  const [saved, setSaved] = useState({ name: initialName, tagline: initialTagline })
  const saver = useAsyncSave<SettingsResponse>()

  const dirty = name !== saved.name || tagline !== saved.tagline
  const canSave = dirty && name.trim().length > 0

  async function save() {
    const data = await saver.run(() =>
      postJson<SettingsResponse>('/api/admin/customization', { appName: name.trim(), tagline: tagline.trim() }),
    )
    if (data) {
      setName(data.settings.appName)
      setTagline(data.settings.tagline)
      setSaved({ name: data.settings.appName, tagline: data.settings.tagline })
      router.refresh()
    }
  }

  const previewName = name.trim() || 'Motiv'

  return (
    <Section
      icon={<Type size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Identity"
      blurb="The app's name appears in the browser tab title, as the installed app's name on the phone home screen, and in system emails. The tagline shows under the logo on the login screen."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Field label="App name" hint={name.trim() ? undefined : 'The app name can’t be empty.'}>
            <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Motiv" className={inputCls} />
          </Field>
          <Field label="Tagline" hint="Optional — a short line shown under the logo on the login screen.">
            <input type="text" value={tagline} maxLength={80} onChange={(e) => setTagline(e.target.value)} placeholder="Maintenance, sorted." className={inputCls} />
          </Field>
        </div>

        {/* Live preview: fake browser tab + phone home-screen icon, driven by
            the typed (unsaved) name. */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Preview</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-2)] px-2.5 py-2 ring-1 ring-[var(--border)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL */}
                <img src={iconSrc} alt="" className="h-3.5 w-3.5 rounded-[3px]" />
                <span className="truncate text-[11px] text-[var(--text)]">{previewName}</span>
                <X size={10} className="ml-auto shrink-0 text-[var(--text-faint)]" />
              </div>
              <p className="text-center text-[10px] text-[var(--text-faint)]">Browser tab</p>
            </div>
            <div className="space-y-1.5">
              <DarkTile className="flex flex-col items-center justify-center gap-1 px-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URL */}
                <img src={iconSrc} alt="" className="h-10 w-10 rounded-xl" />
                <span className="max-w-full truncate text-[10px] text-white/90">{previewName}</span>
              </DarkTile>
              <p className="text-center text-[10px] text-[var(--text-faint)]">Home screen</p>
            </div>
          </div>
        </div>
      </div>

      <SaveRow state={saver.state} error={saver.error} dirty={canSave} onSave={save} />
    </Section>
  )
}

/* ------------------------- 4. Login screen backgrounds --------------------- */

function LoginBackgroundsSection({ initialUrls }: { initialUrls: string[] }) {
  const router = useRouter()
  const [urls, setUrls] = useState<string[]>(initialUrls)
  const [fileErr, setFileErr] = useState('')
  const saver = useAsyncSave<SettingsResponse>()
  const busy = saver.state === 'saving'

  async function persist(next: string[]) {
    const data = await saver.run(() => postJson<SettingsResponse>('/api/admin/customization', { authBgUrls: next }))
    if (data) {
      setUrls(data.settings.authBgUrls)
      router.refresh()
    }
  }

  async function addFiles(files: File[]) {
    const file = files[0]
    if (!file) return
    const err = validateImage(file, ['image/png', 'image/jpeg', 'image/webp'])
    if (err) {
      setFileErr(err)
      return
    }
    setFileErr('')
    // Upload the image first, then persist the full array — two steps by design
    // (the upload route only stores the file; customization owns the list).
    const data = await saver.run(async () => {
      const fd = new FormData()
      fd.append('file', file)
      const up = await postForm<{ ok: true; url: string }>('/api/admin/branding/upload', fd)
      return postJson<SettingsResponse>('/api/admin/customization', { authBgUrls: [...urls, up.url] })
    })
    if (data) {
      setUrls(data.settings.authBgUrls)
      router.refresh()
    }
  }

  const atCapacity = urls.length >= 4
  const { isDragging, dropProps } = useFileDrop({
    onFiles: addFiles,
    accept: 'image/png,image/jpeg,image/webp',
    multiple: false,
    disabled: busy || atCapacity,
  })

  return (
    <Section
      icon={<ImageIcon size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Login screen backgrounds"
      blurb="Optional photos shown behind the login screen — one is picked at random each visit. Without any, the plain dark background is used. Up to 4 photos; tall (portrait) images work best."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {urls.map((url) => (
          <div key={url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary storage URLs */}
            <img src={url} alt="Login background" className="aspect-[3/4] w-full rounded-xl object-cover ring-1 ring-[var(--border)]" />
            <button
              type="button"
              onClick={() => persist(urls.filter((u) => u !== url))}
              disabled={busy}
              aria-label="Remove image"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white transition hover:bg-black/80 disabled:opacity-50"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        {!atCapacity && (
          <label
            {...dropProps}
            className={`flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed text-xs font-semibold text-blue-600 transition hover:bg-[var(--hover)] dark:text-blue-400 ${busy ? 'pointer-events-none opacity-50' : ''} ${isDragging ? 'border-blue-500 bg-blue-500/5 ring-2 ring-blue-500' : 'border-[var(--border)]'}`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            {isDragging ? 'Drop photo here' : 'Add photo'}
          </label>
        )}
      </div>

      {/* Add/remove save immediately — status shows here instead of a Save button. */}
      <div className="flex min-h-[1rem] flex-wrap items-center gap-3 text-xs">
        {busy && <span className="inline-flex items-center gap-1.5 text-[var(--text-muted)]"><Loader2 size={13} className="animate-spin" /> Saving…</span>}
        {saver.state === 'saved' && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400"><Check size={13} /> Saved</span>
        )}
        {(fileErr || saver.state === 'error') && (
          <span className="text-red-600 dark:text-red-400">{fileErr || saver.error}</span>
        )}
      </div>
    </Section>
  )
}

/* ----------------------------- 5. Support contact -------------------------- */

function SupportSection({ initialEmail, initialPhone }: { initialEmail: string; initialPhone: string }) {
  const router = useRouter()
  const [email, setEmail] = useState(initialEmail)
  const [phone, setPhone] = useState(initialPhone)
  const [saved, setSaved] = useState({ email: initialEmail, phone: initialPhone })
  const saver = useAsyncSave<SettingsResponse>()
  const dirty = email !== saved.email || phone !== saved.phone

  async function save() {
    const data = await saver.run(() =>
      postJson<SettingsResponse>('/api/admin/customization', { supportEmail: email.trim(), supportPhone: phone.trim() }),
    )
    if (data) {
      setEmail(data.settings.supportEmail)
      setPhone(data.settings.supportPhone)
      setSaved({ email: data.settings.supportEmail, phone: data.settings.supportPhone })
      router.refresh()
    }
  }

  return (
    <Section
      icon={<LifeBuoy size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Support contact"
      blurb="Shown at the bottom of the login screen so locked-out staff know who to call. Leave both empty to hide it."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Support email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="help@yourcompany.co.za" className={inputCls} />
        </Field>
        <Field label="Support phone">
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="082 000 0000" className={inputCls} />
        </Field>
      </div>
      <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} />
    </Section>
  )
}

/* ------------------------------ 5b. Mobile app ----------------------------- */

function MobileAppSection({ initialAndroid, initialIos, initialUrl }: { initialAndroid: string; initialIos: string; initialUrl: string }) {
  const router = useRouter()
  const [android, setAndroid] = useState(initialAndroid)
  const [ios, setIos] = useState(initialIos)
  const [url, setUrl] = useState(initialUrl)
  const [saved, setSaved] = useState({ android: initialAndroid, ios: initialIos, url: initialUrl })
  const saver = useAsyncSave<SettingsResponse>()
  const dirty = android !== saved.android || ios !== saved.ios || url.trim() !== saved.url

  async function save() {
    const data = await saver.run(() => postJson<SettingsResponse>('/api/admin/customization', {
      appInstallAndroid: android,
      appInstallIos: ios,
      appDownloadUrl: url.trim(),
    }))
    if (data) {
      setAndroid(data.settings.appInstallAndroid)
      setIos(data.settings.appInstallIos)
      setUrl(data.settings.appDownloadUrl)
      setSaved({ android: data.settings.appInstallAndroid, ios: data.settings.appInstallIos, url: data.settings.appDownloadUrl })
      router.refresh()
    }
  }

  // Empty field = fall back to the built-in default (mirrors the email at send time).
  const toSteps = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean)
  const androidSteps = toSteps(android.trim() || DEFAULT_INSTALL_ANDROID)
  const iosSteps = toSteps(ios.trim() || DEFAULT_INSTALL_IOS)
  const dl = url.trim()

  return (
    <Section
      icon={<Smartphone size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Mobile app"
      blurb="Invite emails include a “Get the app” block. There’s no app store — people install it to their home screen straight from the browser. Edit the Android and iPhone steps below; the preview shows exactly how they’ll look in the email. Leave a field empty to use the sensible default."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Android install steps" hint="One step per line. Leave empty to use the default.">
            <textarea value={android} onChange={(e) => setAndroid(e.target.value)} rows={4} maxLength={1200} placeholder={DEFAULT_INSTALL_ANDROID} className={`${inputCls} resize-y leading-relaxed`} />
          </Field>
          <Field label="iPhone / iPad install steps" hint="One step per line. Leave empty to use the default.">
            <textarea value={ios} onChange={(e) => setIos(e.target.value)} rows={4} maxLength={1200} placeholder={DEFAULT_INSTALL_IOS} className={`${inputCls} resize-y leading-relaxed`} />
          </Field>
          <Field label="Optional app download link" hint="Optional — a Play Store or direct APK URL, shown in addition to the steps.">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://play.google.com/store/apps/details?id=…" className={inputCls} />
          </Field>
        </div>

        {/* Phone-mockup preview of the email's “Get the app” block. */}
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text)]">Preview</span>
          <div className="mx-auto max-w-[15rem] rounded-[1.75rem] bg-[var(--surface-2)] p-2 ring-1 ring-[var(--border)] shadow-sm">
            <div className="relative rounded-[1.25rem] bg-white p-4 text-left ring-1 ring-black/5">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-gray-200" />
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Get the app</p>
              <p className="mt-0.5 text-[11px] leading-snug text-gray-500">Install it to your home screen straight from your browser — no app store needed.</p>
              <StepPreview title="On Android" steps={androidSteps} />
              <StepPreview title="On iPhone / iPad" steps={iosSteps} />
              {dl && <p className="mt-2 text-[11px] leading-snug text-gray-700">📥 Prefer a download? <span className="font-semibold text-blue-600">Get it here</span></p>}
              <p className="mt-1.5 text-[11px] leading-snug text-gray-700">💻 Or use it in your browser: <span className="font-semibold text-blue-600">motiv.app</span></p>
            </div>
          </div>
        </div>
      </div>

      <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} />
    </Section>
  )
}

function StepPreview({ title, steps }: { title: string; steps: string[] }) {
  if (!steps.length) return null
  return (
    <div className="mt-2">
      <p className="text-[11px] font-bold text-gray-800">{title}</p>
      <ol className="mt-0.5 list-decimal space-y-0.5 pl-4 text-[11px] leading-snug text-gray-600">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  )
}

/* ---------------------------- 6. Default appearance ------------------------ */

type ThemeChoice = 'light' | 'dark' | 'system'

const THEME_OPTIONS: { value: ThemeChoice; icon: typeof Sun; title: string; desc: string }[] = [
  { value: 'system', icon: Monitor, title: 'System (recommended)', desc: 'Follows each person’s device setting.' },
  { value: 'light', icon: Sun, title: 'Light', desc: 'Everyone starts in light mode.' },
  { value: 'dark', icon: Moon, title: 'Dark', desc: 'Everyone starts in dark mode.' },
]

function AppearanceSection({ initialTheme }: { initialTheme: ThemeChoice }) {
  const router = useRouter()
  const [theme, setTheme] = useState<ThemeChoice>(initialTheme)
  const [savedTheme, setSavedTheme] = useState<ThemeChoice>(initialTheme)
  const saver = useAsyncSave<SettingsResponse>()
  const dirty = theme !== savedTheme

  async function save() {
    const data = await saver.run(() => postJson<SettingsResponse>('/api/admin/customization', { defaultTheme: theme }))
    if (data) {
      setTheme(data.settings.defaultTheme)
      setSavedTheme(data.settings.defaultTheme)
      router.refresh()
    }
  }

  return (
    <Section
      icon={<Sun size={15} className="text-blue-600 dark:text-blue-400" />}
      title="Default appearance"
      blurb="The light/dark mode people see before choosing their own. This only affects people who haven't picked a theme themselves in Settings → Appearance — personal choices always win."
    >
      <div role="radiogroup" aria-label="Default appearance" className="grid gap-3 sm:grid-cols-3">
        {THEME_OPTIONS.map((o) => {
          const active = theme === o.value
          const Icon = o.icon
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(o.value)}
              className={`rounded-xl p-3.5 text-left transition ${
                active
                  ? 'bg-blue-500/10 ring-2 ring-blue-500'
                  : 'ring-1 ring-[var(--border)] hover:bg-[var(--hover)]'
              }`}
            >
              <span className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-blue-700 dark:text-blue-300' : 'text-[var(--text)]'}`}>
                <Icon size={16} /> {o.title}
              </span>
              <span className="mt-1 block text-[11px] leading-snug text-[var(--text-muted)]">{o.desc}</span>
            </button>
          )
        })}
      </div>
      <SaveRow state={saver.state} error={saver.error} dirty={dirty} onSave={save} />
    </Section>
  )
}
