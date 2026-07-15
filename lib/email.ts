// Transactional email via the Resend REST API.
// Mirrors lib/push.ts: silently no-ops (returns false) when not configured, so
// callers never have to guard — a missing RESEND_API_KEY just means no email.
//
// This module is PURE / client-importable on purpose — the admin Customize
// preview imports the render* helpers to draw emails in the browser. Do NOT add
// 'server-only' or import lib/settings-server here; loading the saved copy
// overrides happens in lib/emails/server.ts.

import type { EmailCopy } from '@/lib/settings'

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

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, ...(text ? { text } : {}) }),
    })
    return res.ok
  } catch {
    return false
  }
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
  base: string; heading: string; lead: string; sub?: string; ctaLabel: string; link: string; footerNote: string
  note?: string; noteLabel?: string
}): string {
  const noteBlock = o.note && o.note.trim()
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;"><tr><td style="border-left:3px solid #2563eb;background:#f8fafc;border-radius:0 8px 8px 0;padding:12px 16px;">
            ${o.noteLabel ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#94a3b8;">${escapeHtml(o.noteLabel)}</p>` : ''}
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;white-space:pre-line;">${escapeHtml(o.note.trim())}</p>
          </td></tr></table>`
    : ''
  return `<div style="margin:0;padding:0;background:#f3f4f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 12px;font-family:Arial,Helvetica,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0d1f2d;padding:20px 32px;">
          <img src="${o.base}/brand/motiv-symbol.png" alt="" width="45" height="30" style="display:inline-block;vertical-align:bottom;border:0;height:30px;width:45px;" />
          <img src="${o.base}/brand/motiv-wordmark.png" alt="MOTIV" width="93" height="20" style="display:inline-block;vertical-align:bottom;border:0;height:20px;width:93px;margin-left:9px;" />
        </td></tr>
        <tr><td style="padding:32px;color:#1f2937;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0d1f2d;">${o.heading}</h1>
          <p style="margin:0 0 ${o.sub ? '6px' : '24px'};font-size:15px;line-height:1.6;color:#374151;">${o.lead}</p>
          ${o.sub ? `<p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#374151;">${o.sub}</p>` : ''}
          ${noteBlock}
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#2563eb;">
            <a href="${o.link}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${o.ctaLabel}</a>
          </td></tr></table>
          <p style="margin:26px 0 6px;font-size:12px;color:#6b7280;">Button not working? Copy and paste this link into your browser:</p>
          <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;"><a href="${o.link}" style="color:#2563eb;text-decoration:none;">${o.link}</a></p>
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
function brandedText(copy: EmailCopy, link: string, note?: string): string {
  return [
    copy.heading,
    '',
    copy.lead,
    ...(copy.sub ? ['', copy.sub] : []),
    ...(note && note.trim() ? ['', note.trim()] : []),
    '',
    `${copy.ctaLabel}: ${link}`,
    '',
    copy.footerNote,
  ].join('\n')
}

/**
 * Branded template email (navy header, blue CTA, copy-paste link) — used by the
 * role invite, supplier invite and password-reset emails. `note` renders the
 * optional quoted personal-message block above the CTA.
 */
export function renderBrandedEmail(
  copy: EmailCopy,
  o: { base: string; link: string; note?: string; noteLabel?: string },
): { subject: string; html: string; text: string } {
  const html = motivBrandedEmailHtml({
    base: o.base,
    heading: copy.heading,
    lead: copy.lead,
    sub: copy.sub || undefined,
    ctaLabel: copy.ctaLabel,
    link: o.link,
    footerNote: copy.footerNote,
    note: o.note,
    noteLabel: o.noteLabel,
  })
  return { subject: copy.subject, html, text: brandedText(copy, o.link, o.note) }
}

/**
 * Store-manager welcome email — inline template with a FIXED credentials block
 * (login email + password) and login button. Only heading/lead/ctaLabel/
 * footerNote come from copy; the credentials box structure stays locked.
 */
export function renderStoreWelcome(
  copy: EmailCopy,
  o: { email: string; password: string; loginUrl: string },
): { subject: string; html: string; text: string } {
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <h2 style="color:#1e293b;margin:0 0 12px">${copy.heading}</h2>
    <p style="margin:0 0 16px">${copy.lead}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 8px"><strong>Email:</strong> ${escapeHtml(o.email)}</p>
      <p style="margin:0"><strong>Password:</strong> ${escapeHtml(o.password)}</p>
    </div>
    <p style="margin:0 0 20px">
      <a href="${o.loginUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">${copy.ctaLabel}</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px">${copy.footerNote}</p>
  </div>`

  const text = [
    copy.heading,
    '',
    copy.lead,
    '',
    `Log in here: ${o.loginUrl}`,
    `Email:    ${o.email}`,
    `Password: ${o.password}`,
    '',
    copy.footerNote,
    '',
    '— Motiv',
  ].join('\n')

  return { subject: copy.subject, html, text }
}

/**
 * "You've been added as a supplier" notice — inline template for a supplier who
 * already has an account. Only heading/lead/ctaLabel/footerNote come from copy.
 */
export function renderSupplierAdded(
  copy: EmailCopy,
  o: { loginUrl: string },
): { subject: string; html: string; text: string } {
  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <h2 style="color:#1e293b;margin:0 0 12px">${copy.heading}</h2>
    <p style="margin:0 0 16px">${copy.lead}</p>
    <p style="margin:0 0 20px">
      <a href="${o.loginUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">${copy.ctaLabel}</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:12px">${copy.footerNote}</p>
  </div>`

  const text = [
    copy.heading,
    '',
    copy.lead,
    '',
    `Log in here: ${o.loginUrl}`,
    '',
    copy.footerNote,
    '',
    '— Motiv',
  ].join('\n')

  return { subject: copy.subject, html, text }
}
