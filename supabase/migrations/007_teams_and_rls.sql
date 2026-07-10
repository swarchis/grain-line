-- Team membership + row-level security lockdown.
--
-- Every core table except INITIAL_SCHEMA.sql's `notifications` had RLS off,
-- meaning any authenticated client could read/write any brand's data via the
-- anon key — fine when only one user existed, not once team members and
-- multiple real users are in play. This migration adds brand_members and
-- locks every brand-scoped table down to: the brand's owner, or a user with
-- an active brand_members row.

-- 1. BRAND MEMBERS
create table if not exists public.brand_members (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  invited_email text not null,
  role text not null default 'editor', -- owner | admin | editor | viewer
  status text not null default 'invited', -- invited | active
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  unique(brand_id, invited_email)
);

-- Access-check helpers, security definer so they can read brands/brand_members
-- regardless of the calling user's own RLS visibility into those tables —
-- the standard pattern for cross-table RLS checks in Postgres/Supabase.
create or replace function public.has_brand_access(check_brand_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.brands where id = check_brand_id and user_id = auth.uid())
      or exists (select 1 from public.brand_members where brand_id = check_brand_id and user_id = auth.uid() and status = 'active');
$$;

create or replace function public.is_brand_admin(check_brand_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.brands where id = check_brand_id and user_id = auth.uid())
      or exists (select 1 from public.brand_members where brand_id = check_brand_id and user_id = auth.uid() and status = 'active' and role in ('owner', 'admin'));
$$;

alter table public.brand_members enable row level security;

create policy "See your own membership or members of brands you can access"
  on public.brand_members for select
  using (
    user_id = auth.uid()
    or invited_email = (auth.jwt() ->> 'email')
    or public.has_brand_access(brand_id)
  );

create policy "Admins invite members"
  on public.brand_members for insert
  with check (public.is_brand_admin(brand_id));

create policy "Invited users accept their own invite"
  on public.brand_members for update
  using (invited_email = (auth.jwt() ->> 'email') and user_id is null)
  with check (user_id = auth.uid() and status = 'active');

create policy "Admins manage member roles"
  on public.brand_members for update
  using (public.is_brand_admin(brand_id))
  with check (public.is_brand_admin(brand_id));

create policy "Admins remove members"
  on public.brand_members for delete
  using (public.is_brand_admin(brand_id));

-- 2. RLS LOCKDOWN — brand-scoped tables (direct brand_id column)
alter table public.brands enable row level security;
drop policy if exists "Users manage their own brands" on public.brands;
create policy "Owner manages their brand, members can view it"
  on public.brands for select using (user_id = auth.uid() or public.has_brand_access(id));
create policy "Owner inserts their own brand" on public.brands for insert with check (user_id = auth.uid());
create policy "Owner updates their own brand" on public.brands for update using (user_id = auth.uid());
create policy "Owner deletes their own brand" on public.brands for delete using (user_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array['collections', 'products', 'vendors', 'quotes', 'production_orders']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "brand access select" on public.%I', t);
    execute format('create policy "brand access select" on public.%I for select using (public.has_brand_access(brand_id))', t);
    execute format('drop policy if exists "brand access insert" on public.%I', t);
    execute format('create policy "brand access insert" on public.%I for insert with check (public.has_brand_access(brand_id))', t);
    execute format('drop policy if exists "brand access update" on public.%I', t);
    execute format('create policy "brand access update" on public.%I for update using (public.has_brand_access(brand_id))', t);
    execute format('drop policy if exists "brand access delete" on public.%I', t);
    execute format('create policy "brand access delete" on public.%I for delete using (public.has_brand_access(brand_id))', t);
  end loop;
end $$;

-- 3. RLS — tables scoped via product_id -> products.brand_id (no direct brand_id column)
do $$
declare
  t text;
begin
  foreach t in array array['designs', 'tech_packs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "brand access via product select" on public.%I', t);
    execute format('create policy "brand access via product select" on public.%I for select using (product_id in (select id from public.products where public.has_brand_access(brand_id)))', t);
    execute format('drop policy if exists "brand access via product insert" on public.%I', t);
    execute format('create policy "brand access via product insert" on public.%I for insert with check (product_id in (select id from public.products where public.has_brand_access(brand_id)))', t);
    execute format('drop policy if exists "brand access via product update" on public.%I', t);
    execute format('create policy "brand access via product update" on public.%I for update using (product_id in (select id from public.products where public.has_brand_access(brand_id)))', t);
    execute format('drop policy if exists "brand access via product delete" on public.%I', t);
    execute format('create policy "brand access via product delete" on public.%I for delete using (product_id in (select id from public.products where public.has_brand_access(brand_id)))', t);
  end loop;
end $$;

-- 4. MATERIALS — a shared reference library, not brand-owned. Any signed-in
-- founder can read it; nothing in the app writes to it from the client, so
-- no write policy is added (writes are effectively locked to the DB owner).
alter table public.materials enable row level security;
drop policy if exists "Authenticated users read materials" on public.materials;
create policy "Authenticated users read materials"
  on public.materials for select using (auth.role() = 'authenticated');
