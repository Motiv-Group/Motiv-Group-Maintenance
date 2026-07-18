// POPIA (C11): the version of the privacy policy + terms a user consented to.
// Recorded into auth user_metadata (consent_version + consent_accepted_at) at
// account creation on BOTH self-signup paths (public signup, supplier onboard).
// Bump when the legal copy changes so a re-consent can be required later.
export const CONSENT_VERSION = '2026-07'
