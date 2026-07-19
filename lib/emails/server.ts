import 'server-only'

// Server half of the editable emails: load the saved copy overrides, resolve
// them against the built-in defaults + the caller's dynamic values, and render
// the final { subject, html, text } via the pure renderers in lib/email.ts.
//
// buildEmail is the single entry point callers use — they pass the email key and
// the dynamic (non-copy) inputs that email needs; the editable wording is pulled
// from app_settings automatically.

import type { BrandingState, EmailCopy, EmailKey } from '@/lib/settings'
import { getAppSettings } from '@/lib/settings-server'
import { emailLogoHeader, resolveCopy, type EmailLogo } from '@/lib/emails/defaults'
import { escapeHtml, renderBrandedEmail, renderStoreWelcome, renderSupplierAdded } from '@/lib/email'

/** Dynamic (non-copy) inputs each email needs, keyed by email type. */
export interface EmailVars {
  role_invite: { link: string; base: string; roleLabel: string; invitedTo?: string }
  supplier_invite: { link: string; base: string; inviterCompany?: string | null; message?: string | null }
  password_reset: { link: string; base: string }
  store_welcome: { name: string; loginUrl: string; email: string; password: string; inviter?: string | null; company: string; store: string }
  supplier_added: { loginUrl: string; inviter?: string | null; company: string }
}

export type BuiltEmail = { subject: string; html: string; text: string }
type AppLinks = { downloadUrl: string | null; browserUrl: string }

type Overrides = Partial<EmailCopy> | undefined
type Handlers = { [K in EmailKey]: (vars: EmailVars[K], overrides: Overrides, logo: EmailLogo, app: AppLinks) => BuiltEmail }

const HANDLERS: Handlers = {
  role_invite: (v, overrides, logo, app) => {
    const invitedTo = (v.invitedTo ?? '').trim()
    const copy = resolveCopy('role_invite', overrides, { role: v.roleLabel, invitedTo })
    // Project invites (invitedTo set) reference the project rather than the role,
    // preserving the original wording — unless the admin customised that field.
    if (invitedTo) {
      if (!(overrides?.subject && overrides.subject.trim())) copy.subject = `You've been invited to ${invitedTo} on MOTIV`
      if (!(overrides?.lead && overrides.lead.trim())) copy.lead = `You've been invited to ${escapeHtml(invitedTo)} on MOTIV.`
    }
    return renderBrandedEmail(copy, { logo, link: v.link, app })
  },

  supplier_invite: (v, overrides, logo, app) => {
    const inviter = (v.inviterCompany ?? '').trim()
    const copy = resolveCopy('supplier_invite', overrides, { inviter })
    // The default lead leads with "{inviter} has invited you…". With no inviter
    // and no custom lead, fall back to the impersonal sentence (matches the
    // original built-in email) so it never reads " has invited you…".
    if (!inviter && !(overrides?.lead && overrides.lead.trim())) {
      copy.lead = "You've been invited to join MOTIV as a supplier."
    }
    return renderBrandedEmail(copy, {
      logo,
      link: v.link,
      note: v.message ?? undefined,
      noteLabel: inviter ? `Message from ${inviter}` : 'Message',
      app,
    })
  },

  password_reset: (v, overrides, logo) => {
    const copy = resolveCopy('password_reset', overrides, {})
    return renderBrandedEmail(copy, { logo, link: v.link })
  },

  store_welcome: (v, overrides, logo) => {
    const inviter = (v.inviter && v.inviter.trim()) || 'Your regional manager'
    const copy = resolveCopy('store_welcome', overrides, { name: v.name, inviter, company: v.company, store: v.store })
    return renderStoreWelcome(copy, { logo, email: v.email, password: v.password, loginUrl: v.loginUrl })
  },

  supplier_added: (v, overrides, logo) => {
    const inviter = (v.inviter && v.inviter.trim()) || 'A company'
    const copy = resolveCopy('supplier_added', overrides, { inviter, company: v.company })
    return renderSupplierAdded(copy, { logo, loginUrl: v.loginUrl })
  },
}

/** Absolute origin for the built-in logo fallback. Every email's vars carry
 *  either `base` or a `loginUrl` we can take the origin from. */
function originFrom<K extends EmailKey>(key: K, vars: EmailVars[K]): string {
  if ('base' in vars && vars.base) return vars.base.replace(/\/$/, '')
  if ('loginUrl' in vars && vars.loginUrl) {
    try { return new URL(vars.loginUrl).origin } catch { /* fall through */ }
  }
  return (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
}

/**
 * Build a ready-to-send email: applies the admin's saved copy overrides (or the
 * built-in defaults), substitutes placeholders from `vars`, resolves the header
 * logo (custom upload or built-in), and renders it.
 */
export async function buildEmail<K extends EmailKey>(key: K, vars: EmailVars[K]): Promise<BuiltEmail> {
  const settings = await getAppSettings()
  const origin = originFrom(key, vars)
  const logo = emailLogoHeader(settings.branding as BrandingState, origin)
  const app: AppLinks = { downloadUrl: settings.appDownloadUrl?.trim() || null, browserUrl: origin }
  return HANDLERS[key](vars, settings.emails[key], logo, app)
}
