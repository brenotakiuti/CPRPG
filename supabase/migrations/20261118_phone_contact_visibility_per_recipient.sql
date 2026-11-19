-- Contact visibility is chosen by the GM for each NPC/character grant.
-- Existing grants remain anonymous until explicitly re-shared or revealed.
alter table public.phone_contact_grants
  add column if not exists reveal_real_name boolean not null default false;

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
    (case when g.reveal_real_name then i.internal_name else 'Unknown Number' end)::text,
    (not g.reveal_real_name),
    true, true,
    exists(select 1 from public.phone_conversations pc
      join public.phone_identities self on self.id in (pc.identity_a,pc.identity_b)
        and self.kind='player' and self.character_id=p_character_id
      where i.id in (pc.identity_a,pc.identity_b))
  from public.phone_contact_grants g
  join public.phone_identities i on i.id=g.npc_identity_id and i.kind='npc'
  where g.character_id=p_character_id;
end;
$$;

-- Replace the original three-argument RPC: visibility must be explicit.
drop function if exists public.phone_gm_distribute_contact(uuid,uuid,uuid[]);

create function public.phone_gm_distribute_contact(
  p_campaign_id uuid,p_npc_identity_id uuid,p_character_ids uuid[],
  p_reveal_real_name boolean)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_character_id uuid;
  v_added integer := 0;
  v_inserted integer;
  v_real_name text;
  v_label text;
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for campaign';
  end if;
  select i.internal_name into v_real_name
    from public.phone_identities i
    where i.id=p_npc_identity_id and i.campaign_id=p_campaign_id and i.kind='npc';
  if not found then raise exception 'Invalid NPC identity'; end if;
  if p_reveal_real_name is null then raise exception 'Choose contact visibility'; end if;
  v_label := case when p_reveal_real_name then v_real_name else 'Unknown Number' end;
  if p_character_ids is null or cardinality(p_character_ids)=0 then
    raise exception 'Select at least one recipient';
  end if;
  for v_character_id in select distinct unnest(p_character_ids) loop
    if not exists(select 1 from public.characters ch where ch.id=v_character_id and ch.campaign_id=p_campaign_id) then
      raise exception 'Invalid player character: %',v_character_id;
    end if;
    insert into public.phone_contact_grants(campaign_id,npc_identity_id,character_id,reveal_real_name)
      values(p_campaign_id,p_npc_identity_id,v_character_id,p_reveal_real_name)
      on conflict (npc_identity_id,character_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted=1 then
      insert into public.campaign_events(campaign_id,character_id,audience,category,message)
        values(p_campaign_id,v_character_id,'character','system',
          '[GHOST//LINK CONTACT RECEIVED] ' || v_label);
      v_added:=v_added+1;
    end if;
  end loop;
  return v_added;
end;
$$;
revoke all on function public.phone_gm_distribute_contact(uuid,uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.phone_gm_distribute_contact(uuid,uuid,uuid[],boolean) to authenticated;

-- Real-name sharing also reveals the identity in the existing inbox thread.
-- For anonymous grants, the original anonymous thread label is retained.
-- The player frontend uses the grant label as its preferred name when shared.
