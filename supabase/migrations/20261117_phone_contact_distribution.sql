-- NPC contact distribution. Execute in Supabase SQL Editor before deploying the UI.
-- Grants are per player character and NPC identity; identity revelation remains separate.
create table if not exists public.phone_contact_grants (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  npc_identity_id uuid not null references public.phone_identities(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (npc_identity_id, character_id)
);
alter table public.phone_contact_grants enable row level security;
revoke all on public.phone_contact_grants from public,anon,authenticated;

create or replace function public.phone_gm_contact_grants(p_campaign_id uuid)
returns table(npc_identity_id uuid, character_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for campaign';
  end if;
  return query select g.npc_identity_id,g.character_id
    from public.phone_contact_grants g where g.campaign_id=p_campaign_id;
end;
$$;

create or replace function public.phone_gm_set_contact_access(
  p_campaign_id uuid,p_npc_identity_id uuid,p_character_id uuid,p_allowed boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for campaign';
  end if;
  if not exists(select 1 from public.phone_identities i where i.id=p_npc_identity_id
    and i.campaign_id=p_campaign_id and i.kind='npc') then
    raise exception 'Invalid NPC identity';
  end if;
  if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.campaign_id=p_campaign_id) then
    raise exception 'Invalid player character';
  end if;
  if p_allowed then
    insert into public.phone_contact_grants(campaign_id,npc_identity_id,character_id)
    values(p_campaign_id,p_npc_identity_id,p_character_id)
    on conflict (npc_identity_id,character_id) do nothing;
  else
    delete from public.phone_contact_grants g
    where g.campaign_id=p_campaign_id and g.npc_identity_id=p_npc_identity_id
      and g.character_id=p_character_id;
  end if;
end;
$$;

create or replace function public.phone_player_shared_contacts(p_character_id uuid)
returns table(identity_id uuid,kind text,label text,anonymous boolean,
  can_message boolean,can_call boolean,has_conversation boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.characters ch where ch.id=p_character_id
    and ch.player_id=auth.uid()) then
    raise exception 'Not authorized for character';
  end if;
  return query
  select i.id, 'npc'::text,
    (case when i.anonymous then 'Unknown Number' else i.display_name end)::text,
    i.anonymous, true, true,
    exists(select 1 from public.phone_conversations pc
      join public.phone_identities self on self.id in (pc.identity_a,pc.identity_b)
        and self.kind='player' and self.character_id=p_character_id
      where i.id in (pc.identity_a,pc.identity_b))
  from public.phone_contact_grants g
  join public.phone_identities i on i.id=g.npc_identity_id and i.kind='npc'
  where g.character_id=p_character_id;
end;
$$;
revoke all on function public.phone_gm_contact_grants(uuid) from public,anon,authenticated;
revoke all on function public.phone_gm_set_contact_access(uuid,uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.phone_player_shared_contacts(uuid) from public,anon,authenticated;
grant execute on function public.phone_gm_contact_grants(uuid) to authenticated;
grant execute on function public.phone_gm_set_contact_access(uuid,uuid,uuid,boolean) to authenticated;
grant execute on function public.phone_player_shared_contacts(uuid) to authenticated;
