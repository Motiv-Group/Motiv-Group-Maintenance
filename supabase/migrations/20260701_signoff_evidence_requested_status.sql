-- When the RM sends a COC/POC submission back for more evidence (request_evidence),
-- the signoff row now records that distinctly as 'evidence_requested' (instead of
-- staying 'submitted' and later being swept into 'rejected' by a snag). This keeps
-- the audit trail honest: an evidence request reads "More information requested on
-- COC & POC", separate from a real snag.
alter table public.signoffs drop constraint if exists signoffs_status_check;
alter table public.signoffs add constraint signoffs_status_check
  check (status in ('submitted','awaiting_regional','awaiting_store','accepted','rejected','evidence_requested'));
