-- Optics visibility: retain the GM's existing per-group and per-marker settings.
-- Only GM-revealed units are transmitted. Scanner modes cannot reveal GM-hidden units.
create or replace function public.get_player_tactical_feed(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign uuid;
  v_session public.combat_map_sessions%rowtype;
  v_layout jsonb;
  v_units jsonb;
  v_mine jsonb;
begin
  select c.campaign_id into v_campaign from public.characters c
  where c.id=p_character_id and c.player_id=auth.uid();
  if v_campaign is null then raise exception 'Character access denied'; end if;

  select * into v_session from public.combat_map_sessions s
  where s.campaign_id=v_campaign and s.broadcasting=true;
  if not found then return jsonb_build_object('broadcasting',false); end if;

  select u.value into v_mine from jsonb_array_elements(v_session.units) u
  where u.value->>'type'='player' and u.value->>'characterId'=p_character_id::text limit 1;
  if v_mine is null then return jsonb_build_object('broadcasting',false); end if;

  select m.layout into v_layout from public.combat_maps m
  where m.id=v_session.map_id and m.campaign_id=v_campaign;
  if v_layout is null then return jsonb_build_object('broadcasting',false); end if;

  -- Static terrain may be detected by the optics layers. Never send static marker
  -- placements: marker positions come only from the filtered live session.
  v_layout := jsonb_set(v_layout,'{objects}',coalesce((
    select jsonb_agg(o.value) from jsonb_array_elements(coalesce(v_layout->'objects','[]'::jsonb)) o
    where o.value->>'type' not in ('player','enemy','target','poi')
  ),'[]'::jsonb));

  -- Do not transmit unrevealed enemies, targets or objectives. Preserve their
  -- saved optics flags so the player can switch layers without another RPC.
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',u.value->>'key','label',u.value->>'label',
    'type',u.value->>'type','x',u.value->'x','y',u.value->'y',
    'name',u.value->>'name','mine',(u.value->>'characterId')=p_character_id::text,
    'layers',coalesce(v_layout->'layerVisibility'->(
      case when u.value->>'type'='objective' then 'target:'||substring(u.value->>'label' from 2)
           when u.value->>'type'='target' then 'poi:'||substring(u.value->>'label' from 2)
           else u.value->>'key' end
    ),'{}'::jsonb)
  )),'[]'::jsonb) into v_units
  from jsonb_array_elements(v_session.units) u
  where u.value->>'type'='player'
     or (u.value->>'type' in ('enemy','target','objective')
         and u.value->>'visible'='true');

  -- Strip marker visibility metadata from layout: only transmitted units
  -- receive their own layer flags.
  v_layout := jsonb_set(v_layout,'{layerVisibility}',coalesce((
    select jsonb_object_agg(e.key,e.value)
    from jsonb_each(coalesce(v_layout->'layerVisibility','{}'::jsonb)) e
    where exists (
      select 1 from jsonb_array_elements(coalesce(v_layout->'groups','[]'::jsonb)) g
      where g.value->>'id'=e.key
    )
  ),'{}'::jsonb));

  return jsonb_build_object('broadcasting',true,'mapId',v_session.map_id,
    'layout',v_layout,'units',v_units,
    'visibilityMode',v_session.visibility_mode,'visibilityRadius',v_session.visibility_radius);
end;
$$;
revoke all on function public.get_player_tactical_feed(uuid) from public,anon,authenticated;
grant execute on function public.get_player_tactical_feed(uuid) to authenticated;
