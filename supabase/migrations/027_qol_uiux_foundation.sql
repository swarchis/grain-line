-- Schema for the Collaboration/QoL/UI-UX batch: a generic comments thread
-- usable on any entity type (rather than one-off tables like the existing
-- design_comments/sample_annotations), a unified pin concept superseding
-- the two separate is_favorite (products)/favorited (vendors) booleans,
-- real fabric/care tags on a Design (a genuinely new concept — nothing to
-- reuse from the shared, unrelated Materials Library), and per-user
-- dashboard widget layout.
-- Run this in the Supabase SQL Editor after 026_marketing_foundation.sql.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  entity_type text not null, -- 'vendor' | 'quote' | 'tech_pack' | ...
  entity_id uuid not null,
  author_id uuid references auth.users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_entity_idx on public.comments(entity_type, entity_id);

create table if not exists public.pinned_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  pinned_at timestamptz not null default now(),
  unique(brand_id, entity_type, entity_id)
);

alter table public.designs add column if not exists fabric_tags jsonb not null default '[]'::jsonb;
alter table public.user_preferences add column if not exists dashboard_layout jsonb;

alter table public.comments enable row level security;
alter table public.pinned_items enable row level security;

create policy "brand access select comments" on public.comments for select using (public.has_brand_access(brand_id));
create policy "brand access insert comments" on public.comments for insert with check (public.has_brand_access(brand_id));
create policy "brand access delete comments" on public.comments for delete using (public.has_brand_access(brand_id));

create policy "brand access select pinned_items" on public.pinned_items for select using (public.has_brand_access(brand_id));
create policy "brand access insert pinned_items" on public.pinned_items for insert with check (public.has_brand_access(brand_id));
create policy "brand access delete pinned_items" on public.pinned_items for delete using (public.has_brand_access(brand_id));
