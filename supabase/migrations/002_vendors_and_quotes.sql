-- Vendors + Quotes
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Assumes a `brands` table already exists with columns (id uuid, user_id uuid).
-- Mirrors the brand-isolation RLS pattern already used on `products`/`designs`.

create table if not exists vendors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  category text,
  location text,
  label text not null default 'Imported by user', -- trust label: Imported by user, Previously quoted, Verified partner, etc.
  rating numeric,
  moq integer,
  lead_time text,
  specialties jsonb not null default '[]'::jsonb,
  source_note text, -- whatever link/email/notes the founder pasted in when adding this vendor
  created_at timestamptz not null default now()
);

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  vendor_id uuid not null references vendors(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  status text not null default 'Requested', -- Requested | Received | Accepted | Declined
  amount numeric,
  message text,
  requested_at timestamptz not null default now()
);

alter table vendors enable row level security;
alter table quotes enable row level security;

create policy "select own brand vendors" on vendors for select
  using (brand_id in (select id from brands where user_id = auth.uid()));
create policy "insert own brand vendors" on vendors for insert
  with check (brand_id in (select id from brands where user_id = auth.uid()));
create policy "update own brand vendors" on vendors for update
  using (brand_id in (select id from brands where user_id = auth.uid()));
create policy "delete own brand vendors" on vendors for delete
  using (brand_id in (select id from brands where user_id = auth.uid()));

create policy "select own brand quotes" on quotes for select
  using (brand_id in (select id from brands where user_id = auth.uid()));
create policy "insert own brand quotes" on quotes for insert
  with check (brand_id in (select id from brands where user_id = auth.uid()));
create policy "update own brand quotes" on quotes for update
  using (brand_id in (select id from brands where user_id = auth.uid()));
