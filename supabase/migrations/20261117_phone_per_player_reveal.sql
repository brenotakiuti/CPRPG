-- Per-player, permanent NPC identity revelation.
-- Run in Supabase SQL Editor before deploying the frontend.
create table if not exists public.phone_identity_reveals (
  conversation_id uuid primary key references public.phone_conversations(id) on delete cascade,
  revealed_at timestamptz not null default now()
);
alter table public.phone_identity_reveals enable row level security;
revoke all on public.phone_identity_reveals from public, anon, authenticated;

create or replace function public.phone_reveal_conversation_identity(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.phone_conversations pc
    join public.campaigns c on c.id=pc.campaign_id and c.gm_id=auth.uid()
    join public.phone_identities npc on npc.id in (pc.identity_a,pc.identity_b)
      and npc.kind='npc' and npc.anonymous and npc.campaign_id=pc.campaign_id
    join public.phone_identities player on player.id in (pc.identity_a,pc.identity_b)
      and player.kind='player' and player.campaign_id=pc.campaign_id
    where pc.id=p_conversation_id
  ) then raise exception 'Not authorized or conversation is not anonymous'; end if;
  insert into public.phone_identity_reveals(conversation_id) values(p_conversation_id)
  on conflict (conversation_id) do nothing;
end;
$$;

create or replace function public.phone_gm_reveals(p_campaign_id uuid)
returns table(conversation_id uuid) language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for this campaign';
  end if;
  return query select r.conversation_id from public.phone_identity_reveals r
    join public.phone_conversations pc on pc.id=r.conversation_id
    where pc.campaign_id=p_campaign_id;
end;
$$;

create or replace function public.phone_player_reveals(p_character_id uuid)
returns table(identity_id uuid,revealed_name text)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.characters ch
    where ch.id=p_character_id and ch.player_id=auth.uid()) then
    raise exception 'Not authorized for this character';
  end if;
  return query select npc.id,npc.internal_name::text
    from public.phone_identity_reveals r
    join public.phone_conversations pc on pc.id=r.conversation_id
    join public.phone_identities player on player.id in (pc.identity_a,pc.identity_b)
      and player.kind='player' and player.character_id=p_character_id
    join public.phone_identities npc on npc.id in (pc.identity_a,pc.identity_b)
      and npc.kind='npc' and npc.campaign_id=pc.campaign_id;
end;
$$;
revoke all on function public.phone_reveal_conversation_identity(uuid) from public,anon,authenticated;
revoke all on function public.phone_gm_reveals(uuid) from public,anon,authenticated;
revoke all on function public.phone_player_reveals(uuid) from public,anon,authenticated;
grant execute on function public.phone_reveal_conversation_identity(uuid) to authenticated;
grant execute on function public.phone_gm_reveals(uuid) to authenticated;
grant execute on function public.phone_player_reveals(uuid) to authenticated;
