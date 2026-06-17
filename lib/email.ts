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

/** Build the supplier invite email — a reusable onboarding link (custom token). */
export function supplierInviteEmail({ link, companyName }: { link: string; companyName: string }): { subject: string; html: string; text: string } {
  const subject = `You've been invited to MOTIV as a supplier`
  const text = [
    `Hi,`,
    ``,
    `${companyName} has been added to MOTIV as a supplier.`,
    `Open the link below to set up your account — choose your password and confirm your company details:`,
    ``,
    link,
    ``,
    `This link stays valid until you complete sign-up.`,
    ``,
    `— Motiv`,
  ].join('\n')

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;color:#0f172a">
    <h2 style="color:#1e293b;margin:0 0 12px">Welcome to MOTIV</h2>
    <p style="margin:0 0 16px"><strong>${companyName}</strong> has been added as a supplier. Set up your account — choose a password and confirm your company details.</p>
    <p style="margin:0 0 20px">
      <a href="${link}" style="display:inline-block;background:#C6A35D;color:#0a0e17;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Set up my account</a>
    </p>
    <p style="margin:0 0 8px;color:#64748b;font-size:12px">If the button doesn't work, paste this link:<br>${link}</p>
    <p style="margin:0;color:#64748b;font-size:12px">This link stays valid until you finish signing up.</p>
  </div>`

  return { subject, html, text }
}
