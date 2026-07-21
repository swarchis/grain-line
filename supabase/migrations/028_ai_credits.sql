-- ============================================================================
-- AI CREDITS — per-brand credit budgets funded by subscription.
--
-- Replaces the count-based ai_usage_log (008) with a dollar-denominated credit
-- ledger. Each brand holds a balance; Stripe payments GRANT credits each cycle
-- (see the invoice.paid webhook), AI calls DEBIT them server-side, failed calls
-- are REFUNDED. All writes happen from the API's service-role client — clients
-- can only READ their own balance (RLS below), never mint credits.
--
-- Grant sizes live in two places that MUST stay in sync:
--   · here (the CASE below + seed), and
--   · la-guia/src/data/plans.js  (creditsPerMonth per tier).
-- Per-feature costs live in api/config/aiCredits.js (authoritative) mirrored in
-- la-guia/src/data/aiCredits.js (display only).
-- ============================================================================

-- Balance: one row per brand. subscription_credits reset each billing cycle;
-- topup_credits are purchased and persist until spent.
create table if not exists public.brand_ai_credits (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  subscription_credits integer not null default 0,
  topup_credits integer not null default 0,
  cycle_reset_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Append-only audit trail of every credit movement.
create table if not exists public.ai_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null check (type in ('grant', 'debit', 'refund', 'topup')),
  credits integer not null,          -- signed: grants/topups/refunds > 0, debits < 0
  feature text,
  balance_after integer not null,
  stripe_ref text,
  created_at timestamptz not null default now()
);
create index if not exists ai_credit_ledger_brand_idx on public.ai_credit_ledger(brand_id, created_at desc);

alter table public.brand_ai_credits enable row level security;
alter table public.ai_credit_ledger enable row level security;

-- Read-only for brand members; no client insert/update/delete policies exist,
-- so only the service-role API (which bypasses RLS) can change balances.
create policy "brand reads own credit balance"
  on public.brand_ai_credits for select using (public.has_brand_access(brand_id));
create policy "brand reads own credit ledger"
  on public.ai_credit_ledger for select using (public.has_brand_access(brand_id));

-- ── Atomic debit ────────────────────────────────────────────────────────────
-- Locks the balance row (FOR UPDATE) so concurrent AI calls can't overspend.
-- Spends subscription_credits first, then topup_credits. Returns the new total
-- balance on success, or -1 if the brand has no row or insufficient credits.
create or replace function public.debit_ai_credits(p_brand_id uuid, p_cost integer, p_feature text)
returns integer language plpgsql security definer as $$
declare
  v_sub integer;
  v_top integer;
  v_from_sub integer;
  v_from_top integer;
  v_total integer;
begin
  select subscription_credits, topup_credits into v_sub, v_top
    from public.brand_ai_credits where brand_id = p_brand_id for update;
  if not found then
    return -1;
  end if;
  if (v_sub + v_top) < p_cost then
    return -1;
  end if;
  v_from_sub := least(v_sub, p_cost);
  v_from_top := p_cost - v_from_sub;
  update public.brand_ai_credits
    set subscription_credits = subscription_credits - v_from_sub,
        topup_credits = topup_credits - v_from_top,
        updated_at = now()
    where brand_id = p_brand_id;
  v_total := (v_sub - v_from_sub) + (v_top - v_from_top);
  insert into public.ai_credit_ledger(brand_id, type, credits, feature, balance_after)
    values (p_brand_id, 'debit', -p_cost, p_feature, v_total);
  return v_total;
end $$;

-- ── Refund (failed AI call) ──────────────────────────────────────────────────
create or replace function public.refund_ai_credits(p_brand_id uuid, p_amount integer, p_feature text)
returns integer language plpgsql security definer as $$
declare v_total integer;
begin
  update public.brand_ai_credits
    set subscription_credits = subscription_credits + p_amount,
        updated_at = now()
    where brand_id = p_brand_id
    returning subscription_credits + topup_credits into v_total;
  if v_total is null then return -1; end if;
  insert into public.ai_credit_ledger(brand_id, type, credits, feature, balance_after)
    values (p_brand_id, 'refund', p_amount, p_feature, v_total);
  return v_total;
end $$;

-- ── Grant (subscription renewal) ─────────────────────────────────────────────
-- SETS the subscription bucket to the tier's allowance (does not accumulate)
-- and stamps the next reset. Upserts the row so new brands get one on first pay.
create or replace function public.grant_subscription_credits(p_brand_id uuid, p_amount integer, p_reset_at timestamptz)
returns integer language plpgsql security definer as $$
declare v_total integer;
begin
  insert into public.brand_ai_credits(brand_id, subscription_credits, cycle_reset_at, updated_at)
    values (p_brand_id, p_amount, p_reset_at, now())
  on conflict (brand_id) do update
    set subscription_credits = excluded.subscription_credits,
        cycle_reset_at = excluded.cycle_reset_at,
        updated_at = now();
  select subscription_credits + topup_credits into v_total
    from public.brand_ai_credits where brand_id = p_brand_id;
  insert into public.ai_credit_ledger(brand_id, type, credits, feature, balance_after)
    values (p_brand_id, 'grant', p_amount, 'subscription_grant', v_total);
  return v_total;
end $$;

-- ── Top-up (Phase 2 purchase) ────────────────────────────────────────────────
create or replace function public.add_topup_credits(p_brand_id uuid, p_amount integer, p_stripe_ref text)
returns integer language plpgsql security definer as $$
declare v_total integer;
begin
  insert into public.brand_ai_credits(brand_id, topup_credits, updated_at)
    values (p_brand_id, p_amount, now())
  on conflict (brand_id) do update
    set topup_credits = public.brand_ai_credits.topup_credits + p_amount,
        updated_at = now();
  select subscription_credits + topup_credits into v_total
    from public.brand_ai_credits where brand_id = p_brand_id;
  insert into public.ai_credit_ledger(brand_id, type, credits, feature, balance_after, stripe_ref)
    values (p_brand_id, 'topup', p_amount, 'topup_purchase', v_total, p_stripe_ref);
  return v_total;
end $$;

-- ── Seed existing brands so nobody is locked out on deploy ───────────────────
-- Gives each current brand its tier's allowance immediately; real resets happen
-- on the next invoice.paid. Grant sizes mirror plans.js creditsPerMonth.
insert into public.brand_ai_credits (brand_id, subscription_credits, cycle_reset_at)
select b.id,
       case b.plan_tier when 'basic' then 500 when 'premium' then 1500 else 0 end,
       date_trunc('month', now()) + interval '1 month'
from public.brands b
on conflict (brand_id) do nothing;
