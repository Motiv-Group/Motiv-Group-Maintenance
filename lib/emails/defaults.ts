// Editable email copy — defaults, placeholders and pure resolve helpers.
//
// This module is PURE and safe to import from both client and server code (the
// admin Customize preview imports it in the browser). It must NOT pull in any
// server-only module. The server half — loading overrides + rendering the final
// email — lives in lib/emails/server.ts.
//
// The 6 copy fields (subject/heading/lead/sub/ctaLabel/footerNote) and the
// override storage shape are defined in lib/settings.ts; here we attach the
// built-in copy, the admin-facing labels, and the {placeholders} each email
// supports. The `defaults` reproduce the app's current hardcoded wording so
// nothing changes visually until an admin overrides a field.

import { EMAIL_COPY_FIELDS } from '@/lib/settings'
import type { EmailCopy, EmailCopyField, EmailKey } from '@/lib/settings'

export interface EmailDef {
  key: EmailKey
  /** Admin-facing name shown in the email picker. */
  name: string
  /** One-line explanation of when this email is sent. */
  description: string
  /** The {tokens} an admin may use in this email's copy. */
  placeholders: string[]
  /** Which of the 6 copy fields this email actually uses, in UI order. */
  fields: EmailCopyField[]
  /** The current built-in copy (verbatim) — used when nothing is overridden. */
  defaults: EmailCopy
  /** True when the email also renders a fixed login email + password block. */
  hasCredentials?: boolean
}

const ALL_FIELDS: EmailCopyField[] = ['subject', 'heading', 'lead', 'sub', 'ctaLabel', 'footerNote']
const NO_SUB_FIELDS: EmailCopyField[] = ['subject', 'heading', 'lead', 'ctaLabel', 'footerNote']

export const EMAIL_DEFS: Record<EmailKey, EmailDef> = {
  role_invite: {
    key: 'role_invite',
    name: 'Team invite',
    description:
      'Sent when you invite a regional manager, store manager, executive or supplier admin. Carries a link to set their password and sign in.',
    placeholders: ['{role}', '{invitedTo}'],
    fields: ALL_FIELDS,
    defaults: {
      subject: "You've been invited to MOTIV as {role}",
      heading: "You're invited to MOTIV",
      lead: "You've been added as {role}.",
      sub: 'Set your password to activate your account and sign in.',
      ctaLabel: 'Set password & sign in',
      footerNote:
        "This invitation was sent by MOTIV. If you weren't expecting it, you can safely ignore this email.",
    },
  },
  supplier_invite: {
    key: 'supplier_invite',
    name: 'Supplier invite',
    description:
      'Sent to a new supplier (one who does not yet have an account) so they can set up a login and start receiving work. Can carry a personal message from the inviter.',
    placeholders: ['{inviter}'],
    fields: ALL_FIELDS,
    defaults: {
      subject: "You've been invited to MOTIV as a supplier",
      heading: "You're invited to MOTIV",
      lead: '{inviter} has invited you to join MOTIV as a supplier.',
      sub: 'Set up your account — choose a password and confirm your company details — to start receiving work.',
      ctaLabel: 'Set up my account',
      footerNote:
        "This invitation link stays valid until you finish signing up. If you weren't expecting it, you can safely ignore this email.",
    },
  },
  password_reset: {
    key: 'password_reset',
    name: 'Password reset',
    description: 'Sent when someone asks to reset their password from the login screen.',
    placeholders: [],
    fields: ALL_FIELDS,
    defaults: {
      subject: 'Reset your MOTIV password',
      heading: 'Reset your password',
      lead: 'We received a request to reset the password for your MOTIV account.',
      sub: 'Click below to choose a new password.',
      ctaLabel: 'Reset password',
      footerNote:
        "If you didn't request this, you can safely ignore this email — your password won't change.",
    },
  },
  store_welcome: {
    key: 'store_welcome',
    name: 'Store welcome',
    description:
      'Sent to a store manager when their account is created for them. Includes their login email and password in a fixed block.',
    placeholders: ['{name}', '{inviter}', '{company}', '{store}'],
    fields: NO_SUB_FIELDS,
    hasCredentials: true,
    defaults: {
      subject: "You've been added to Motiv — {company} ({store})",
      heading: 'Welcome to Motiv',
      lead: '{inviter} has created a Motiv account for {company} — {store}. Use the details below to log in.',
      sub: '',
      ctaLabel: 'Log in to Motiv',
      footerNote: 'Please change your password after your first login (Settings → Profile).',
    },
  },
  supplier_added: {
    key: 'supplier_added',
    name: 'Supplier added',
    description:
      'Sent to a supplier who already has a Motiv account when a company adds them as one of their suppliers — no setup needed, just a heads-up.',
    placeholders: ['{inviter}', '{company}'],
    fields: NO_SUB_FIELDS,
    defaults: {
      subject: "You've been added as a supplier on Motiv",
      heading: "You've been added as a supplier",
      lead: "{inviter} has added {company} as one of their suppliers on Motiv. You already have a Motiv account, so there's nothing to set up — just log in to see any work they send your way.",
      sub: '',
      ctaLabel: 'Log in to Motiv',
      footerNote: "If the button doesn't work, use the login link above.",
    },
  },
}

/**
 * Substitute every `{token}` in `text` with `vars[token]`. Unknown or empty
 * tokens become '' and any resulting run of extra spaces is collapsed. Returns
 * plain text — HTML escaping (where needed) happens at render time.
 */
export function applyPlaceholders(text: string, vars: Record<string, string>): string {
  return text
    .replace(/\{(\w+)\}/g, (_match, token: string) => vars[token] ?? '')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * Fully resolve one email's copy: start from the built-in defaults, overlay any
 * non-empty override field, then substitute placeholders in every field.
 */
export function resolveCopy(
  key: EmailKey,
  overrides: Partial<EmailCopy> | undefined,
  vars: Record<string, string>,
): EmailCopy {
  const defaults = EMAIL_DEFS[key].defaults
  const out = {} as EmailCopy
  for (const field of EMAIL_COPY_FIELDS) {
    const override = overrides?.[field]
    const base = typeof override === 'string' && override.trim() ? override : defaults[field]
    out[field] = applyPlaceholders(base, vars)
  }
  return out
}

/**
 * Realistic sample placeholder values, used to drive the live preview in the
 * admin editor. Only covers the copy-field {tokens}; dynamic bits (links,
 * credentials) are supplied by the preview renderer.
 */
export const SAMPLE_VARS: Record<EmailKey, Record<string, string>> = {
  role_invite: { role: 'Regional Manager', invitedTo: '' },
  supplier_invite: { inviter: 'Pick n Pay' },
  password_reset: {},
  store_welcome: {
    name: 'Thabo Nkosi',
    inviter: 'Sipho Dlamini',
    company: 'Pick n Pay',
    store: 'Sea Point',
  },
  supplier_added: { inviter: 'Pick n Pay', company: 'FlowFix Plumbing' },
}
