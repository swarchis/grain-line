-- RFQ & Quotes: sending one request-for-quote to multiple vendors at once,
-- a manual counter-offer/negotiation log (vendors aren't Atelier users, so
-- this is the founder's own record of the back-and-forth, not a live two-way
-- chat), and cached AI-assisted cost economics per quote.
-- Run this in the Supabase SQL Editor after 003_vendor_enhancements.sql.

create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity text,
  target_unit_cost numeric,
  deadline text,
  message text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.quotes add column if not exists rfq_id uuid references public.rfqs(id) on delete set null;

-- Founder-entered log of counter-offers and vendor responses for a quote —
-- 'counter' is what the founder proposed back, 'response' is what the
-- founder heard back from the vendor (typed in manually, same honesty
-- standard as "Draft email": nothing here is auto-generated as if the
-- vendor actually said it).
create table if not exists public.quote_negotiations (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  direction text not null default 'counter', -- 'counter' | 'response'
  amount numeric,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Cached AI-assisted economics so the Cost Breakdown Wheel, Landed Cost
-- Calculator, and AI Cost Simulator don't need to re-call the AI (or lose a
-- founder's manual edits) every time the quote is reopened.
alter table public.quotes add column if not exists cost_breakdown jsonb not null default '{}'::jsonb;
alter table public.quotes add column if not exists landed_cost_inputs jsonb not null default '{}'::jsonb;
alter table public.quotes add column if not exists cost_simulator jsonb not null default '[]'::jsonb;

alter table public.rfqs enable row level security;
alter table public.quote_negotiations enable row level security;

create policy "brand access select rfqs" on public.rfqs for select using (public.has_brand_access(brand_id));
create policy "brand access insert rfqs" on public.rfqs for insert with check (public.has_brand_access(brand_id));
create policy "brand access delete rfqs" on public.rfqs for delete using (public.has_brand_access(brand_id));

create policy "brand access select negotiations" on public.quote_negotiations for select
  using (exists (select 1 from public.quotes q where q.id = quote_id and public.has_brand_access(q.brand_id)));
create policy "brand access insert negotiations" on public.quote_negotiations for insert
  with check (exists (select 1 from public.quotes q where q.id = quote_id and public.has_brand_access(q.brand_id)));
