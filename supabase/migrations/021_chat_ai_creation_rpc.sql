-- Repair path for personal AI chat creation.
--
-- Some deployed projects can pass the chat SELECT policy but fail the direct
-- client INSERT into public.chats with "new row violates row-level security",
-- usually because the active brand relationship is being checked through
-- another RLS-protected table. Keep the access decision centralized, then let
-- the function create or return the user's one AI chat for the brand.

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

  if not public.has_brand_access(p_brand_id) then
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
