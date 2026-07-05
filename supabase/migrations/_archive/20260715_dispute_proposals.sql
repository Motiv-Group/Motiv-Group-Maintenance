-- Dispute resolution as a negotiation. Either side can CONCEDE unilaterally
-- (supplier withdraws the dispute → the request stands; RM retracts the request →
-- it's dropped), or PROPOSE an outcome the other side must confirm (supplier proposes
-- to resolve/drop; RM proposes to uphold/keep). One proposal pending at a time; a
-- counter-proposal replaces it. These columns hold the current pending proposal.
-- Idempotent.
alter table public.ticket_disputes add column if not exists pending_outcome text;         -- 'withdrawn' (drop) | 'upheld' (keep) | null
alter table public.ticket_disputes add column if not exists pending_by      text;         -- 'supplier' | 'regional_manager' | null
alter table public.ticket_disputes add column if not exists pending_at      timestamptz;
