-- Make chat creation resilient even for deployed clients that still use the
-- direct INSERT path from 016_chat.sql.
--
-- 021 added an RPC fallback, but a deployed browser bundle that has not been
-- refreshed/rebuilt will still hit the original INSERT policy. Recreate that
-- policy with explicit brand-owner/member checks so it no longer depends on
-- a stale or differently-defined has_brand_access() helper.

drop policy if exists "brand members create chats" on public.chats;

create policy "brand members create chats" on public.chats for insert
  with check (
    created_by = auth.uid()
    and (
      exists (
        select 1
          from public.brands b
         where b.id = brand_id
           and b.user_id = auth.uid()
      )
      or exists (
        select 1
          from public.brand_members bm
         where bm.brand_id = brand_id
           and bm.user_id = auth.uid()
           and bm.status = 'active'
      )
    )
  );

create or replace function public.ensure_personal_ai_chat(p_brand_id uuid)
returns public.chats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_chat public.chats;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
      from public.brands b
     where b.id = p_brand_id
       and b.user_id = v_user_id
  ) and not exists (
    select 1
      from public.brand_members bm
     where bm.brand_id = p_brand_id
       and bm.user_id = v_user_id
       and bm.status = 'active'
  ) then
    raise exception 'No access to brand %', p_brand_id;
  end if;

  select *
    into v_chat
    from public.chats
   where brand_id = p_brand_id
     and type = 'ai'
     and created_by = v_user_id
   order by created_at asc
   limit 1;

  if v_chat.id is not null then
    return v_chat;
  end if;

  insert into public.chats (brand_id, type, name, created_by)
  values (p_brand_id, 'ai', 'AI Assistant', v_user_id)
  returning * into v_chat;

  return v_chat;
end;
$$;

grant execute on function public.ensure_personal_ai_chat(uuid) to authenticated;
