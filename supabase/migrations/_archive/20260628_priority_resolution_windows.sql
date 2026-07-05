-- Priority "resolution window" update (time-to-resolve before a ticket is overdue).
-- New headline windows: P1 Urgent 4h · P2 High 1 day · P3 Medium 5 days · P4 Low 7 days.
-- Only resolution_mins changes; first-response / attendance / quote / internal-decision
-- targets are left as-is. Idempotent: safe to re-run. Updates the platform-default
-- rows (company_id IS NULL) which seed every company unless they override a row.
update public.sla_rules set resolution_mins =   240, updated_at = now() where company_id is null and priority = 'P1';  -- 4 hours
update public.sla_rules set resolution_mins =  1440, updated_at = now() where company_id is null and priority = 'P2';  -- 1 day
update public.sla_rules set resolution_mins =  7200, updated_at = now() where company_id is null and priority = 'P3';  -- 5 days (unchanged)
update public.sla_rules set resolution_mins = 10080, updated_at = now() where company_id is null and priority = 'P4';  -- 7 days
