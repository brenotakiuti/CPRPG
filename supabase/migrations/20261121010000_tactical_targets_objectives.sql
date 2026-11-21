-- Tactical targets and objectives are GM-controlled markers.
-- Existing editor "target" objects are objectives; new "poi" objects are targets.
-- The layerVisibility entries for target:N and poi:N retain optics discoverability
-- settings (network, thermal, acoustic, night) for future optics activation.
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
  -- Never expose any marker placements via the static layout, including legacy targets.
  v_layout := jsonb_set(v_layout,'{objects}',coalesce((
    select jsonb_agg(o.value) from jsonb_array_elements(coalesce(v_layout->'objects','[]'::jsonb)) o
    where o.value->>'type' not in ('player','enemy','target','poi')
      and not exists (
        select 1 from jsonb_array_elements(coalesce(v_layout->'groups','[]'::jsonb)) g
        where (g.value->'cells') ? ((o.value->>'x')||','||(o.value->>'y'))
          and coalesce((v_layout->'layerVisibility'->(g.value->>'id')->>'tactical')::boolean,true)=false
      )
  ),'[]'::jsonb));
  -- Only transmit markers explicitly revealed by GM. Optics settings do not
  -- override GM visibility until a dedicated optics mode is implemented.
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',u.value->>'key','label',u.value->>'label',
    'type',u.value->>'type','x',u.value->'x','y',u.value->'y',
    'name',u.value->>'name','mine',(u.value->>'characterId')=p_character_id::text
  )),'[]'::jsonb) into v_units
  from jsonb_array_elements(v_session.units) u
  where u.value->>'type'='player'
     or (u.value->>'type' in ('enemy','target','objective')
       and u.value->>'visible'='true'
       and coalesce((v_layout->'layerVisibility'->(
          case when u.value->>'type'='objective' then 'target:'||substring(u.value->>'label' from 2)
               when u.value->>'type'='target' then 'poi:'||substring(u.value->>'label' from 2)
               else u.value->>'key' end
       )->>'tactical')::boolean,true)
       and (v_session.visibility_mode='full'
         or ((u.value->>'x')::numeric-(v_mine->>'x')::numeric)^2
            +((u.value->>'y')::numeric-(v_mine->>'y')::numeric)^2
            <= v_session.visibility_radius*v_session.visibility_radius));
  return jsonb_build_object('broadcasting',true,'mapId',v_session.map_id,
    'layout',v_layout,'units',v_units,
    'visibilityMode',v_session.visibility_mode,'visibilityRadius',v_session.visibility_radius);
end;
$$;
revoke all on function public.get_player_tactical_feed(uuid) from public,anon,authenticated;
grant execute on function public.get_player_tactical_feed(uuid) to authenticated;
