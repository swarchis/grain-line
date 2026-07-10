-- Subscription plan tracking + AI usage metering.
alter table public.brands add column if not exists plan_tier text not null default 'free';
alter table public.brands add column if not exists stripe_customer_id text;
alter table public.brands add column if not exists stripe_subscription_id text;

-- One row per AI design/tech-pack/silhouette generation, used to enforce each
-- plan's monthly cap. Cheap to query (count rows this month), no cron needed —
-- "this calendar month" is computed at query time, not reset by a job.
create table if not exists public.ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  feature text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_usage_log enable row level security;

create policy "brand access select"
  on public.ai_usage_log for select using (public.has_brand_access(brand_id));
create policy "brand access insert"
  on public.ai_usage_log for insert with check (public.has_brand_access(brand_id));
