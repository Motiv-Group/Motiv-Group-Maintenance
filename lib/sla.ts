// Supplier SLA versioning. Bump whenever /sla terms change materially. The
// supplier onboarding wizard stores the version each supplier accepted
// (supplier_sla_acceptances.sla_version); a bump re-prompts every supplier to
// re-accept on next login before receiving new work.
export const SLA_VERSION = '1.0'

// True when a supplier must (re-)accept the current SLA — either they've never
// accepted (pre-wizard invited suppliers have no acceptance row) or their latest
// acceptance predates the current SLA_VERSION. Plain equality: any version change
// re-prompts.
export function slaNeedsAcceptance(acceptedVersion: string | null | undefined): boolean {
  return acceptedVersion !== SLA_VERSION
}
