-- Chat: a per-user AI assistant chat plus real group chats between brand
-- teammates. Visibility is per-chat-membership, not just brand membership —
-- being on the same brand shouldn't let you read someone else's AI
-- conversation or a group chat you weren't added to.
-- Run this in the Supabase SQL Editor after 007_teams_and_rls.sql (needs
-- has_brand_access).

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  type text not null default 'group', -- 'ai' | 'group'
  name text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_participants (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  added_at timestamptz not null default now(),
  unique(chat_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null, -- null for AI/system messages
  sender_type text not null default 'user', -- 'user' | 'ai'
  body text not null,
  created_at timestamptz not null default now()
);

-- security definer so it can be used inside chat_participants' own policy
-- without that policy needing to re-check itself recursively.
create or replace function public.is_chat_member(p_chat_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.chats c
    where c.id = p_chat_id
      and (
        c.created_by = auth.uid()
        or exists (select 1 from public.chat_participants cp where cp.chat_id = c.id and cp.user_id = auth.uid())
      )
  );
$$;

alter table public.chats enable row level security;
alter table public.chat_participants enable row level security;
alter table public.chat_messages enable row level security;

create policy "chat members select chats" on public.chats for select
  using (public.has_brand_access(brand_id) and public.is_chat_member(id));
create policy "brand members create chats" on public.chats for insert
  with check (public.has_brand_access(brand_id) and created_by = auth.uid());
create policy "creator updates chat" on public.chats for update
  using (created_by = auth.uid());
create policy "creator deletes chat" on public.chats for delete
  using (created_by = auth.uid());

create policy "chat members select participants" on public.chat_participants for select
  using (public.is_chat_member(chat_id));
create policy "chat members add participants" on public.chat_participants for insert
  with check (public.is_chat_member(chat_id));
create policy "member leaves or is removed" on public.chat_participants for delete
  using (public.is_chat_member(chat_id));
create policy "member marks own read state" on public.chat_participants for update
  using (user_id = auth.uid());

create policy "chat members select messages" on public.chat_messages for select
  using (public.is_chat_member(chat_id));
create policy "chat members send messages" on public.chat_messages for insert
  with check (public.is_chat_member(chat_id));
