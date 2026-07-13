// Transactional email via the Resend REST API.
// Mirrors lib/push.ts: silently no-ops (returns false) when not configured, so
// callers never have to guard — a missing RESEND_API_KEY just means no email.

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

/** Branded password-reset email (sent via our Resend sender, not Supabase). */
export function passwordResetEmailHtml(link: string, base: string): string {
  return motivBrandedEmailHtml({
    base,
    heading: 'Reset your password',
    lead: 'We received a request to reset the password for your MOTIV account.',
    sub: 'Click below to choose a new password.',
    ctaLabel: 'Reset password',
    link,
    footerNote: "If you didn't request this, you can safely ignore this email — your password won't change.",
  })
}

interface StoreInviteArgs {
  managerName: string
  loginUrl:    string
  email:       string
  password:    string
  rmName?:     string | null
  company:     string
  subStore:    string
}

/** Build the welcome email for a freshly-provisioned store-manager account. */
export function storeInviteEmail({
  managerName, loginUrl, email, password, rmName, company, subStore,
}: StoreInviteArgs): { subject: string; html: string; text: string } {
  const subject = `You've been added to Motiv — ${company} (${subStore})`

  const text = [
    `Hi ${managerName || 'there'},`,
    ``,
    `${rmName ? `${rmName} has` : 'Your regional manager has'} created a Motiv account for ${company} — ${subStore}.`,
    ``,
    `Log in here: ${loginUrl}`,
    `Email:    ${email}`,
    `Password: ${password}`,
    ``,
    `Please change your password after your first login (Settings → Profile).`,
    ``,
    `— Motiv`,
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <h2 style="color:#1e293b;margin:0 0 12px">Welcome to Motiv</h2>
    <p style="margin:0 0 12px">Hi ${managerName || 'there'},</p>
    <p style="margin:0 0 16px">
      ${rmName ? `${rmName} has` : 'Your regional manager has'} created a Motiv account for
      <strong>${company} — ${subStore}</strong>. Use the details below to log in.
    </p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:0 0 16px">
      <p style="margin:0 0 8px"><strong>Email:</strong> ${email}</p>
      <p style="margin:0"><strong>Password:</strong> ${password}</p>
    </div>
    <p style="margin:0 0 20px">
      <a href="${loginUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Log in to Motiv</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:13px">Please change your password after your first login (Settings → Profile).</p>
  </div>`

  return { subject, html, text }
}

/** Notice email for a supplier whose email already has a Motiv account — they
 *  don't need to create a login, so we tell them they've been added instead of
 *  sending an onboarding link. */
export function supplierAddedNoticeEmail({ companyName, addedBy, loginUrl }: { companyName: string; addedBy?: string | null; loginUrl: string }): { subject: string; html: string; text: string } {
  const subject = `You've been added as a supplier on Motiv`
  const who = addedBy ? `${addedBy}` : 'A company'
  const text = [
    `Hi,`,
    ``,
    `${who} has added ${companyName} as one of their suppliers on Motiv.`,
    `You already have a Motiv account, so there's nothing to set up — just log in to see any work they send your way:`,
    ``,
    loginUrl,
    ``,
    `— Motiv`,
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <h2 style="color:#1e293b;margin:0 0 12px">You've been added as a supplier</h2>
    <p style="margin:0 0 16px">${who} has added <strong>${companyName}</strong> as one of their suppliers on Motiv.</p>
    <p style="margin:0 0 16px">You already have a Motiv account, so there's nothing to set up — just log in to see any work they send your way.</p>
    <p style="margin:0 0 20px">
      <a href="${loginUrl}" style="display:inline-block;background:#1e293b;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Log in to Motiv</a>
    </p>
    <p style="margin:0;color:#64748b;font-size:12px">If the button doesn't work, paste this link:<br>${loginUrl}</p>
  </div>`

  return { subject, html, text }
}

/** Build the supplier invite email — a reusable onboarding link (custom token).
 *  Uses the shared branded MOTIV template (same look as the RM/SM invites), and
 *  carries the inviter's optional personal message. `inviterCompany` is the client
 *  company doing the inviting; `message` is the RM's free-text note. */
export function supplierInviteEmail(
  { link, base, inviterCompany, message }: { link: string; base: string; inviterCompany?: string | null; message?: string | null },
): { subject: string; html: string; text: string } {
  const subject = `You've been invited to MOTIV as a supplier`
  const inviter = (inviterCompany ?? '').trim()
  const lead = inviter
    ? `<strong style="color:#0d1f2d;">${escapeHtml(inviter)}</strong> has invited you to join <strong style="color:#0d1f2d;">MOTIV</strong> as a supplier.`
    : `You've been invited to join <strong style="color:#0d1f2d;">MOTIV</strong> as a supplier.`

  const html = motivBrandedEmailHtml({
    base,
    heading: "You're invited to MOTIV",
    lead,
    sub: 'Set up your account — choose a password and confirm your company details — to start receiving work.',
    note: message ?? undefined,
    noteLabel: inviter ? `Message from ${inviter}` : 'Message',
    ctaLabel: 'Set up my account',
    link,
    footerNote: "This invitation link stays valid until you finish signing up. If you weren't expecting it, you can safely ignore this email.",
  })

  const text = [
    `Hi,`,
    ``,
    inviter ? `${inviter} has invited you to join MOTIV as a supplier.` : `You've been invited to join MOTIV as a supplier.`,
    `Open the link below to set up your account — choose your password and confirm your company details:`,
    ``,
    link,
    ...(message && message.trim() ? ['', `Message: ${message.trim()}`] : []),
    ``,
    `This link stays valid until you complete sign-up.`,
    ``,
    `— Motiv`,
  ].join('\n')

  return { subject, html, text }
}
