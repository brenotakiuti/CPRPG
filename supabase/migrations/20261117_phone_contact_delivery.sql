-- Contact delivery using the existing append-only campaign_events infrastructure.
-- Requires sql/campaign_events.sql and sql/campaign_events_audience_migration.sql.
-- No new notification table or publication is required.
create or replace function public.phone_gm_distribute_contact(
  p_campaign_id uuid,p_npc_identity_id uuid,p_character_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_character_id uuid;
  v_added integer := 0;
  v_inserted integer;
  v_public_label text;
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for campaign';
  end if;
  select case when i.anonymous then 'Unknown Number' else i.display_name end
    into v_public_label
    from public.phone_identities i
    where i.id=p_npc_identity_id and i.campaign_id=p_campaign_id and i.kind='npc';
  if not found then raise exception 'Invalid NPC identity'; end if;
  if p_character_ids is null or cardinality(p_character_ids)=0 then
    raise exception 'Select at least one recipient';
  end if;
  for v_character_id in select distinct unnest(p_character_ids) loop
    if not exists(select 1 from public.characters ch where ch.id=v_character_id and ch.campaign_id=p_campaign_id) then
      raise exception 'Invalid player character: %',v_character_id;
    end if;
    insert into public.phone_contact_grants(campaign_id,npc_identity_id,character_id)
      values(p_campaign_id,p_npc_identity_id,v_character_id)
      on conflict (npc_identity_id,character_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted=1 then
      insert into public.campaign_events(campaign_id,character_id,audience,category,message)
        values(p_campaign_id,v_character_id,'character','system',
          '[GHOST//LINK CONTACT RECEIVED] ' || v_public_label);
      v_added:=v_added+1;
    end if;
  end loop;
  return v_added;
end;
$$;
revoke all on function public.phone_gm_distribute_contact(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.phone_gm_distribute_contact(uuid,uuid,uuid[]) to authenticated;
