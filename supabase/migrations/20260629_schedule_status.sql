-- Tracks whether a scheduled visit time is within the SLA window ('agreed') or a
-- custom time the supplier proposed beyond it ('proposed'), which the RM must
-- accept. On acceptance the resolution/attendance/first-response due dates are
-- shifted to the agreed time so meeting it is not counted as an SLA breach.
alter table if exists tickets
  add column if not exists schedule_status text;
