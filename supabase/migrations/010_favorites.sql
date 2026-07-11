-- Lets founders star products for the "Favorite projects" dashboard widget.
alter table public.products add column if not exists is_favorite boolean not null default false;
