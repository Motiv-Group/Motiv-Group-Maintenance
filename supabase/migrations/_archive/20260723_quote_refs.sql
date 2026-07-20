-- ---------------------------------------------------------------------------
-- 20260723_quote_refs
-- ---------------------------------------------------------------------------
-- Every quote gets a human-readable reference "Q-YYYY-NNNNN" (per-year counter),
-- shown on the supplier's declined-quote card and anywhere a quote is cited.
-- Mirrors the ticket job_ref pattern: counter table locked behind RLS with no
-- policy, assigned by a SECURITY DEFINER BEFORE INSERT trigger.
-- Idempotent; backfills existing quotes oldest-first per year.

alter table public.quotes add column if not exists quote_ref text;

create table if not exists public.quote_ref_counters (
  year         integer not null primary key,
  last_number  integer not null default 0
);
alter table public.quote_ref_counters enable row level security;  -- no policy: trigger only

CREATE OR REPLACE FUNCTION public.assign_quote_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_year integer := EXTRACT(year FROM COALESCE(NEW.created_at, now()))::integer;
  v_seq  integer;
BEGIN
  IF NEW.quote_ref IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.quote_ref_counters (year, last_number)
    VALUES (v_year, 1)
    ON CONFLICT (year)
    DO UPDATE SET last_number = public.quote_ref_counters.last_number + 1
    RETURNING last_number INTO v_seq;

  NEW.quote_ref := 'Q-' || v_year::text || '-' || lpad(v_seq::text, 5, '0');
  RETURN NEW;
END;
$function$
;
revoke execute on function public.assign_quote_ref() from anon, authenticated;

drop trigger if exists trg_assign_quote_ref on public.quotes;
create trigger trg_assign_quote_ref BEFORE INSERT on public.quotes for each row EXECUTE FUNCTION assign_quote_ref();

-- Backfill existing quotes (oldest first within each year).
with numbered as (
  select id,
         extract(year from created_at)::int as y,
         row_number() over (partition by extract(year from created_at) order by created_at, id) as rn
  from public.quotes
  where quote_ref is null
)
update public.quotes q
set quote_ref = 'Q-' || n.y::text || '-' || lpad(n.rn::text, 5, '0')
from numbered n
where n.id = q.id;

-- Advance the counters past the highest assigned number per year, so new inserts
-- never collide with backfilled refs.
insert into public.quote_ref_counters (year, last_number)
select s.y, max(s.n)
from (
  select extract(year from created_at)::int as y, right(quote_ref, 5)::int as n
  from public.quotes
  where quote_ref ~ '^Q-\d{4}-\d{5}$'
) s
group by s.y
on conflict (year) do update
set last_number = greatest(public.quote_ref_counters.last_number, excluded.last_number);
