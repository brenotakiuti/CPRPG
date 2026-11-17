-- Run once in Supabase SQL Editor before using the GM unread badge.
-- Counts only messages sent by players to NPCs, independently for each NPC conversation.
create or replace function public.phone_gm_unread(p_campaign_id uuid)
returns table(conversation_id uuid, npc_identity_id uuid, unread_count bigint)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for this campaign';
  end if;
  return query
  select pc.id, npc.id, count(pm.id)::bigint
  from public.phone_conversations pc
  join public.phone_identities npc on npc.id in (pc.identity_a,pc.identity_b)
    and npc.kind='npc' and npc.campaign_id=p_campaign_id
  left join public.phone_read_state prs on prs.conversation_id=pc.id and prs.reader_identity_id=npc.id
  left join public.phone_messages pm on pm.conversation_id=pc.id
    and pm.sender_identity_id<>npc.id
    and (prs.last_read_at is null or pm.created_at>prs.last_read_at)
  where pc.campaign_id=p_campaign_id
  group by pc.id,npc.id;
end;
$$;

create or replace function public.phone_gm_mark_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_npc_id uuid;
begin
  select npc.id into v_npc_id
  from public.phone_conversations pc
  join public.campaigns c on c.id=pc.campaign_id and c.gm_id=auth.uid()
  join public.phone_identities npc on npc.id in (pc.identity_a,pc.identity_b)
    and npc.kind='npc' and npc.campaign_id=pc.campaign_id
  where pc.id=p_conversation_id;
  if v_npc_id is null then raise exception 'Not authorized for this conversation'; end if;
  insert into public.phone_read_state(conversation_id,reader_identity_id,last_read_at)
  values(p_conversation_id,v_npc_id,now())
  on conflict(conversation_id,reader_identity_id)
  do update set last_read_at=excluded.last_read_at;
end;
$$;

-- Preserve the existing phone_gm_threads shape, adding unread_count.
-- Existing return types cannot be changed with CREATE OR REPLACE; drop first.
drop function if exists public.phone_gm_threads(uuid);
create function public.phone_gm_threads(p_campaign_id uuid)
returns table(
  conversation_id uuid, npc_identity_id uuid, npc_internal_name text,
  npc_public_label text, player_identity_id uuid, player_name text,
  last_message_at timestamptz, last_message text, unread_count bigint
)
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for this campaign';
  end if;
  return query
  select pc.id,npc.id,npc.internal_name,
    case when npc.anonymous then 'Unknown Number' else npc.display_name end,
    player.id,coalesce(player.display_name,'Player'),
    latest.created_at,latest.body,coalesce(unread.unread_count,0)
  from public.phone_conversations pc
  join public.phone_identities npc on npc.id in(pc.identity_a,pc.identity_b) and npc.kind='npc'
  join public.phone_identities player on player.id in(pc.identity_a,pc.identity_b) and player.kind='player'
  left join lateral (
    select pm.created_at,pm.body from public.phone_messages pm
    where pm.conversation_id=pc.id order by pm.created_at desc,pm.id desc limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint unread_count from public.phone_messages pm
    left join public.phone_read_state prs on prs.conversation_id=pc.id and prs.reader_identity_id=npc.id
    where pm.conversation_id=pc.id and pm.sender_identity_id=player.id
      and (prs.last_read_at is null or pm.created_at>prs.last_read_at)
  ) unread on true
  where pc.campaign_id=p_campaign_id
  order by latest.created_at desc nulls last;
end;
$$;

revoke all on function public.phone_gm_unread(uuid) from public,anon;
revoke all on function public.phone_gm_mark_read(uuid) from public,anon;
revoke all on function public.phone_gm_threads(uuid) from public,anon;
grant execute on function public.phone_gm_unread(uuid) to authenticated;
grant execute on function public.phone_gm_mark_read(uuid) to authenticated;
grant execute on function public.phone_gm_threads(uuid) to authenticated;
