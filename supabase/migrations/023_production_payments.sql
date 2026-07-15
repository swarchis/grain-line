-- Production payment ledger: the "Payments" tab on ProductionOrderDetail and
-- the break-even math on ProductInsights (actual factory spend) have both
-- been reading and writing this table since an earlier session, but no
-- migration ever created it -- it either exists ad hoc in the live project
-- or those features have been silently no-op-ing. This closes that gap.
-- Schema matches ProductionContext.jsx's addPayment() insert exactly.
-- Run this in the Supabase SQL Editor after 019_production_tracking.sql.

create table if not exists public.production_payments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  production_order_id uuid not null references public.production_orders(id) on delete cascade,
  amount numeric not null,
  paid_at date not null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists production_payments_brand_idx on public.production_payments(brand_id);
create index if not exists production_payments_order_idx on public.production_payments(production_order_id);

alter table public.production_payments enable row level security;

create policy "brand access select payments" on public.production_payments for select using (public.has_brand_access(brand_id));
create policy "brand access insert payments" on public.production_payments for insert with check (public.has_brand_access(brand_id));
create policy "brand access delete payments" on public.production_payments for delete using (public.has_brand_access(brand_id));
