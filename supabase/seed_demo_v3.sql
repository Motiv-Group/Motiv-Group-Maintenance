-- ============================================================
-- MOTIV v3 — DEMO SEED (run AFTER schema_v3.sql on a fresh/dev project)
-- Creates one company + regions + stores + suppliers + varied tickets so the
-- executive dashboard renders populated (health spread across bands).
-- Then attach your executive login (bottom).
-- Re-runnable-ish: uses a fixed company id; delete that company to reset.
-- ============================================================
do $$
declare comp uuid := '11111111-1111-1111-1111-111111111111';
begin
  insert into public.companies (id, name) values (comp, 'Motiv Demo')
    on conflict (id) do nothing;

  -- regions
  insert into public.regions (company_id, region_code, name) values
    (comp,'GP','Gauteng'), (comp,'WC','Western Cape'), (comp,'KZN','KwaZulu-Natal'), (comp,'FS','Free State')
  on conflict (company_id, region_code) do nothing;

  -- suppliers
  insert into public.suppliers (company_id, company_name, trade, qualified) values
    (comp,'BuildFix Solutions','General','t'), (comp,'RapidServe Electrical','Electrical','t'),
    (comp,'ProTech Plumbing','Plumbing','t'), (comp,'Alpha Maintenance','HVAC','t')
  on conflict do nothing;

  -- stores (branch_code unique per company)
  insert into public.stores (company_id, region_id, region_code, branch_code, name)
  select comp, r.id, r.region_code, v.branch, v.nm from (values
    ('GP','GP001','Sandton City'), ('GP','GP002','Eastgate'), ('GP','GP003','Menlyn Park'),
    ('WC','WC001','Canal Walk'), ('WC','WC002','Tygervalley'),
    ('KZN','KZN001','Gateway'), ('KZN','KZN002','Pavilion'),
    ('FS','FS001','Mimosa Mall')
  ) v(rc, branch, nm) join public.regions r on r.company_id=comp and r.region_code=v.rc
  on conflict (company_id, branch_code) do nothing;
end $$;

-- Varied tickets to spread health (created_at in the past → some breached)
insert into public.tickets (company_id, store_id, region_id, region_code, supplier_id, title, description, priority, severity, operational_impact, safety_risk_flag, trading_impact_flag, category, status, quote_required, quote_decision_required, quote_decision_status, quote_value, created_at)
select c.id, s.id, s.region_id, s.region_code, sup.id, v.title, v.title, v.pri, v.sev, v.impact, v.safety, v.trading, v.cat, v.status, v.qreq, v.qdec, v.qstat, v.qval,
       now() - (v.age_days || ' days')::interval
from (values
  -- branch, title, priority, severity, impact, safety, trading, category, status, qreq, qdec, qstat, qval, age_days
  ('GP001','Gas leak in kitchen','P1','critical','safety_risk', true,  true,  'Gas',        'in_progress', false,false,null,0,      12),
  ('GP001','Lighting out front',  'P3','medium','customer_visible',false,false,'Electrical', 'open',        false,false,null,0,      3),
  ('GP002','HVAC failure sales floor','P2','high','trading_affected',false,true,'HVAC',      'quoted',      true, true, 'pending', 48000,  6),
  ('GP002','Leaking tap BOH','P4','low','cosmetic',          false,false,'Plumbing',   'open',        false,false,null,0,      2),
  ('GP003','Door sensor fault','P3','medium','customer_visible',false,false,'Electrical','submitted_for_signoff',false,false,null,0, 4),
  ('WC001','Aircon noisy','P4','low','staff_inconvenience',  false,false,'HVAC',       'open',        false,false,null,0,      1),
  ('WC002','Signage light out','P4','low','cosmetic',        false,false,'Electrical', 'completed',   false,false,null,0,      9),
  ('KZN001','Blocked drain','P2','high','trading_affected',  false,true, 'Plumbing',   'open',        true, false,null,0,      7),
  ('KZN002','Repaint entrance','P4','low','cosmetic',        false,false,'General',    'completed',   false,false,null,0,      14),
  ('FS001','Fridge temperature alarm','P1','critical','trading_affected',false,true,'Refrigeration','quoted',true,true,'pending',76000, 5)
) v(branch,title,pri,sev,impact,safety,trading,cat,status,qreq,qdec,qstat,qval,age_days)
join public.stores s on s.branch_code=v.branch and s.company_id='11111111-1111-1111-1111-111111111111'
join public.companies c on c.id='11111111-1111-1111-1111-111111111111'
left join lateral (select id from public.suppliers where company_id=c.id order by random() limit 1) sup on true;

-- ── Attach your executive login (create the auth user first via signup as Executive) ──
-- update public.user_profiles
--   set company_id='11111111-1111-1111-1111-111111111111', role='executive'
--   where email='you@co.za';
