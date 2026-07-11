-- AI Design Studio: moodboard/palette/variants live on the design itself;
-- versions and comments get their own tables since they're append-only logs,
-- not a single current value.
alter table public.designs add column if not exists moodboard jsonb default '[]'::jsonb;
alter table public.designs add column if not exists palette jsonb default '[]'::jsonb;
alter table public.designs add column if not exists variants jsonb default '[]'::jsonb;

create table if not exists public.design_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  image_url text not null,
  label text not null default 'Snapshot',
  source text not null default 'manual', -- manual | sketch-to-design | ai-edit | bg-remove | recolor | fabric-swap | logo-placement | mockup | flat-sketch | view
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.design_comments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.design_versions enable row level security;
alter table public.design_comments enable row level security;

create policy "brand access select versions" on public.design_versions for select
  using (exists (select 1 from public.products p where p.id = product_id and public.has_brand_access(p.brand_id)));
create policy "brand access insert versions" on public.design_versions for insert
  with check (exists (select 1 from public.products p where p.id = product_id and public.has_brand_access(p.brand_id)));
create policy "brand access delete versions" on public.design_versions for delete
  using (exists (select 1 from public.products p where p.id = product_id and public.has_brand_access(p.brand_id)));

create policy "brand access select comments" on public.design_comments for select
  using (exists (select 1 from public.products p where p.id = product_id and public.has_brand_access(p.brand_id)));
create policy "brand access insert comments" on public.design_comments for insert
  with check (exists (select 1 from public.products p where p.id = product_id and public.has_brand_access(p.brand_id)));
create policy "brand access delete comments" on public.design_comments for delete
  using (exists (select 1 from public.products p where p.id = product_id and public.has_brand_access(p.brand_id)));

-- Home dashboard sticky notes — 3 persisted slots per brand, one "active"
-- (shown large) and the rest in storage (shown small, swappable).
create table if not exists public.brand_notes (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  slot int not null check (slot in (0, 1, 2)),
  mode text not null default 'text', -- text | draw
  text_content text default '',
  drawing_data text, -- base64 PNG snapshot of the pencil-tool canvas
  updated_at timestamptz not null default now(),
  unique(brand_id, slot)
);

alter table public.brand_notes enable row level security;
create policy "brand access select notes" on public.brand_notes for select using (public.has_brand_access(brand_id));
create policy "brand access insert notes" on public.brand_notes for insert with check (public.has_brand_access(brand_id));
create policy "brand access update notes" on public.brand_notes for update using (public.has_brand_access(brand_id));
