-- Read-only tactical transmission for claimed player characters.
-- SECURITY DEFINER deliberately returns only a filtered projection, never the GM's units JSON.
create or replace function public.get_player_tactical_feed(p_character_id uuid)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign uuid;
  v_session public.combat_map_sessions%rowtype;
  v_layout jsonb;
  v_units jsonb;
begin
  select c.campaign_id into v_campaign from public.characters c
  where c.id = p_character_id and c.player_id = auth.uid();
  if v_campaign is null then raise exception 'Character access denied'; end if;

  select * into v_session from public.combat_map_sessions s
  where s.campaign_id = v_campaign and s.broadcasting = true;
  if not found then return jsonb_build_object('broadcasting', false); end if;

  select m.layout into v_layout from public.combat_maps m
  where m.id = v_session.map_id and m.campaign_id = v_campaign;
  if v_layout is null then return jsonb_build_object('broadcasting', false); end if;

  -- Remove all editor unit placements from the transmitted map.
  v_layout := jsonb_set(v_layout, '{objects}', coalesce((
    select jsonb_agg(o.value) from jsonb_array_elements(coalesce(v_layout->'objects','[]'::jsonb)) o
    where o.value->>'type' not in ('player','enemy')
  ), '[]'::jsonb));

  select coalesce(jsonb_agg(jsonb_build_object(
    'key', u.value->>'key', 'label', u.value->>'label',
    'type', u.value->>'type', 'x', u.value->'x', 'y', u.value->'y',
    'name', u.value->>'name', 'mine', (u.value->>'characterId') = p_character_id::text
  )), '[]'::jsonb) into v_units
  from jsonb_array_elements(v_session.units) u
  where u.value->>'type' = 'player'
     or (u.value->>'type' = 'enemy' and u.value->>'visible' = 'true');

  return jsonb_build_object('broadcasting', true, 'mapId', v_session.map_id,
    'layout', v_layout, 'units', v_units);
end;
$$;
revoke all on function public.get_player_tactical_feed(uuid) from public, anon, authenticated;
grant execute on function public.get_player_tactical_feed(uuid) to authenticated;
