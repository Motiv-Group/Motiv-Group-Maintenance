// Supplier SLA versioning. Bump whenever /sla terms change materially. The
// supplier onboarding wizard stores the version each supplier accepted
// (supplier_sla_acceptances.sla_version); a bump re-prompts every supplier to
// re-accept on next login before receiving new work.
export const SLA_VERSION = '1.0'
