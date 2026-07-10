-- Per-user (not per-brand) preferences: theme, onboarding tour state, and small
-- UI toggles. One row per auth user, created lazily on first read.
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  theme text not null default 'light',
  onboarding_completed boolean not null default false,
  show_shortcut_hints boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users manage their own preferences"
  on public.user_preferences for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
