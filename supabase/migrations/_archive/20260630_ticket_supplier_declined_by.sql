-- Records who took a supplier off a ticket: 'supplier' (they declined the work)
-- vs 'regional_manager' (the RM declined their quote). Lets the supplier UI show
-- "Declined (you)" and the right wording in the decline block. Null = auto-closed
-- because another supplier was awarded.
alter table if exists ticket_suppliers
  add column if not exists declined_by text;
