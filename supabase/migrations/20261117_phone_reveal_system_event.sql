-- Execute once in Supabase SQL Editor before testing automatic reveal events.
-- Replaces the existing reveal RPC. A first-time reveal and its message are atomic.
create or replace function public.phone_reveal_conversation_identity(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_npc_id uuid;
  v_npc_name text;
  v_inserted uuid;
begin
  select npc.id, npc.internal_name::text into v_npc_id, v_npc_name
  from public.phone_conversations pc
  join public.campaigns c on c.id=pc.campaign_id and c.gm_id=auth.uid()
  join public.phone_identities npc on npc.id in (pc.identity_a,pc.identity_b)
    and npc.kind='npc' and npc.anonymous and npc.campaign_id=pc.campaign_id
  join public.phone_identities player on player.id in (pc.identity_a,pc.identity_b)
    and player.kind='player' and player.campaign_id=pc.campaign_id
  where pc.id=p_conversation_id;
  if v_npc_id is null then
    raise exception 'Not authorized or conversation is not anonymous';
  end if;

  insert into public.phone_identity_reveals(conversation_id)
  values(p_conversation_id)
  on conflict (conversation_id) do nothing
  returning conversation_id into v_inserted;

  -- Do not duplicate the system event if the identity was already revealed.
  if v_inserted is not null then
    insert into public.phone_messages(conversation_id,sender_identity_id,body)
    values(p_conversation_id,v_npc_id,
      '[GHOST//LINK IDENTITY REVEALED] Unknown Number has been revealed as ' || v_npc_name || '.');
  end if;
end;
$$;
revoke all on function public.phone_reveal_conversation_identity(uuid) from public,anon,authenticated;
grant execute on function public.phone_reveal_conversation_identity(uuid) to authenticated;
