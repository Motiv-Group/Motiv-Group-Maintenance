// Transactional email via the Resend REST API.
// Mirrors lib/push.ts: silently no-ops (returns false) when not configured, so
// callers never have to guard — a missing RESEND_API_KEY just means no email.
//
// This module is PURE / client-importable on purpose — the admin Customize
// preview imports the render* helpers to draw emails in the browser. Do NOT add
// 'server-only' or import lib/settings-server here; loading the saved copy
// overrides happens in lib/emails/server.ts.

import type { EmailCopy } from '@/lib/settings'
import type { EmailLogo } from '@/lib/emails/defaults'

interface SendEmailArgs {
  to:      string
  subject: string
  html:    string
  text?:   string
}

/**
 * Send a single email. Returns true if Resend accepted it, false otherwise
 * (missing config, network error, or non-2xx). Never throws.
 */
export async function sendEmail({ to, subject, html, text }: SendEmailArgs): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.EMAIL_FROM
  if (!apiKey || !from) return false

  // Inline timeout+retry (not lib/fetch-retry) — this module must stay pure /
  // client-importable (see header note), so no Sentry import here.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html, ...(text ? { text } : {}) }),
        signal: AbortSignal.timeout(15_000),
      })
      if (res.status >= 500 && attempt === 0) continue
      return res.ok
    } catch {
      // retry once on network error/timeout, then give up quietly (best-effort)
    }
  }
  return false
}

/** Escape untrusted text before dropping it into an email's HTML body. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ── Branded transactional template ──────────────────────────────────────────
// Table-based + inline styles for broad email-client support (Gmail/Outlook strip
// <style> + classes). Navy MOTIV header (brand logo), blue CTA (the app's action
// colour), copy-paste fallback link, footer. Shared by the invite + reset emails.
// Optional `note` renders a quoted personal-message block (blue rule) above the
// CTA — used to carry the inviter's own words. `note` is plain text; escape it here.
export function motivBrandedEmailHtml(o: {
  logo: EmailLogo; heading: string; lead: string; sub?: string; ctaLabel: string; link: string; footerNote: string
  note?: string; noteLabel?: string
  /** Optional login credentials box (store-manager welcome). */
  credentials?: { email: string; password: string }
  /** Optional "get the app on your phone / open in browser" block. */
  app?: { downloadUrl?: string | null; browserUrl?: string | null }
}): string {
  const dl = o.app?.downloadUrl?.trim() || ''
  const br = o.app?.browserUrl?.trim() || ''
  const appBlock = (dl || br)
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;border-top:1px solid #eef0f2;"><tr><td style="padding-top:18px;">
            <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Get the app</p>
            ${dl ? `<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#374151;">📱 On your phone: <a href="${dl}" style="color:#2563eb;text-decoration:none;font-weight:600;">Download the Android app</a></p>` : ''}
            ${br ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#374151;">💻 Or use it in your browser: <a href="${br}" style="color:#2563eb;text-decoration:none;font-weight:600;">${br}</a></p>` : ''}
          </td></tr></table>`
    : ''
  const noteBlock = o.note && o.note.trim()
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-left:3px solid #2563eb;background:#f8fafc;border-radius:0 8px 8px 0;padding:12px 16px;">
            ${o.noteLabel ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">${escapeHtml(o.noteLabel)}</p>` : ''}
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;white-space:pre-line;">${escapeHtml(o.note.trim())}</p>
          </td></tr></table>`
    : ''
  const credsBlock = o.credentials
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
            <p style="margin:0 0 10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">Your login details</p>
            <p style="margin:0 0 8px;font-size:14px;line-height:1.5;color:#374151;"><strong style="color:#0d1f2d;">Email:</strong> ${escapeHtml(o.credentials.email)}</p>
            <p style="margin:0;font-size:14px;line-height:1.5;color:#374151;"><strong style="color:#0d1f2d;">Password:</strong> <span style="font-family:Menlo,Consolas,monospace;">${escapeHtml(o.credentials.password)}</span></p>
          </td></tr></table>`
    : ''
  return `<div style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0d1f2d;padding:20px 32px;">
          <img src="${o.logo.symbolUrl}" alt="" width="${o.logo.symbolW}" height="${o.logo.symbolH}" style="display:inline-block;vertical-align:bottom;border:0;height:${o.logo.symbolH}px;width:${o.logo.symbolW}px;" />
          <img src="${o.logo.wordmarkUrl}" alt="MOTIV" width="${o.logo.wordmarkW}" height="${o.logo.wordmarkH}" style="display:inline-block;vertical-align:bottom;border:0;height:${o.logo.wordmarkH}px;width:${o.logo.wordmarkW}px;margin-left:9px;" />
        </td></tr>
        <tr><td style="padding:32px;color:#1f2937;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0d1f2d;">${o.heading}</h1>
          <p style="margin:0 0 ${o.sub ? '6px' : '24px'};font-size:15px;line-height:1.6;color:#374151;">${o.lead}</p>
          ${o.sub ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${o.sub}</p>` : ''}
          ${credsBlock}
          ${noteBlock}
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#2563eb;">
            <a href="${o.link}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${o.ctaLabel}</a>
          </td></tr></table>
          <p style="margin:26px 0 6px;font-size:12px;color:#6b7280;">Button not working? Copy and paste this link into your browser:</p>
          <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${o.link}" style="color:#2563eb;text-decoration:none;">${o.link}</a></p>
          ${appBlock}
        </td></tr>
        <tr><td style="padding:18px 32px;border-top:1px solid #eef0f2;background:#fafbfc;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">${o.footerNote}</p>
        </td></tr>
      </table>
      <p style="max-width:480px;margin:16px auto 0;font-size:11px;color:#b4b8bf;text-align:center;">© MOTIV · Maintenance &amp; ticketing</p>
    </td></tr>
  </table>
</div>`
}

// ── Pure renderers (resolved copy → { subject, html, text }) ─────────────────
// Each takes an already-resolved EmailCopy (placeholders substituted upstream)
// plus the dynamic, non-editable inputs it needs (links, credentials, base).
// The copy is system_admin-authored, so — like the strings that used to live
// here — it is trusted and rendered into HTML as-is. buildEmail (server) wires
// the saved overrides + defaults to these; the admin preview calls them directly.

/** Plain-text sibling of a branded (link + CTA) email. */
function brandedText(
  copy: EmailCopy,
  link: string,
  o?: { note?: string; credentials?: { email: string; password: string }; app?: { downloadUrl?: string | null; browserUrl?: string | null } },
): string {
  const dl = o?.app?.downloadUrl?.trim() || ''
  const br = o?.app?.browserUrl?.trim() || ''
  const appLines = (dl || br)
    ? ['', 'Get the app:', ...(dl ? [`  On your phone (Android): ${dl}`] : []), ...(br ? [`  In your browser: ${br}`] : [])]
    : []
  return [
    copy.heading,
    '',
    copy.lead,
    ...(copy.sub ? ['', copy.sub] : []),
    ...(o?.credentials ? ['', `Email:    ${o.credentials.email}`, `Password: ${o.credentials.password}`] : []),
    ...(o?.note && o.note.trim() ? ['', o.note.trim()] : []),
    '',
    `${copy.ctaLabel}: ${link}`,
    ...appLines,
    '',
    copy.footerNote,
  ].join('\n')
}

/**
 * The branded template email (logo header, blue CTA, copy-paste link) — the
 * single renderer behind EVERY transactional email so they all share one
 * professional layout. `note` renders the optional quoted personal-message block;
 * `credentials` renders the locked login-details box (store-manager welcome).
 */
export function renderBrandedEmail(
  copy: EmailCopy,
  o: { logo: EmailLogo; link: string; note?: string; noteLabel?: string; credentials?: { email: string; password: string }; app?: { downloadUrl?: string | null; browserUrl?: string | null } },
): { subject: string; html: string; text: string } {
  const html = motivBrandedEmailHtml({
    logo: o.logo,
    heading: copy.heading,
    lead: copy.lead,
    sub: copy.sub || undefined,
    ctaLabel: copy.ctaLabel,
    link: o.link,
    footerNote: copy.footerNote,
    note: o.note,
    noteLabel: o.noteLabel,
    credentials: o.credentials,
    app: o.app,
  })
  return { subject: copy.subject, html, text: brandedText(copy, o.link, { note: o.note, credentials: o.credentials, app: o.app }) }
}

/**
 * Store-manager welcome — the branded template with a FIXED login-credentials
 * box and the login button. Copy (heading/lead/sub/ctaLabel/footerNote) is
 * editable; the credentials block structure stays locked.
 */
export function renderStoreWelcome(
  copy: EmailCopy,
  o: { logo: EmailLogo; email: string; password: string; loginUrl: string },
): { subject: string; html: string; text: string } {
  return renderBrandedEmail(copy, { logo: o.logo, link: o.loginUrl, credentials: { email: o.email, password: o.password } })
}

/**
 * "You've been added as a supplier" notice for a supplier who already has an
 * account — the same branded template, login button, no credentials.
 */
export function renderSupplierAdded(
  copy: EmailCopy,
  o: { logo: EmailLogo; loginUrl: string },
): { subject: string; html: string; text: string } {
  return renderBrandedEmail(copy, { logo: o.logo, link: o.loginUrl })
}
