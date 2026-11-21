-- Atomic player-marker movement. Only the anonymous account that claimed
-- the character assigned to a marker may move it.
create or replace function public.move_player_tactical_unit(
  p_character_id uuid, p_marker_key text, p_x integer, p_y integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign uuid;
  v_session public.combat_map_sessions%rowtype;
  v_width integer;
  v_height integer;
  v_units jsonb;
  v_unit jsonb;
  v_index integer;
begin
  select c.campaign_id into v_campaign
  from public.characters c
  where c.id = p_character_id and c.player_id = auth.uid();
  if v_campaign is null then raise exception 'Character access denied'; end if;

  select * into v_session from public.combat_map_sessions s
  where s.campaign_id = v_campaign for update;
  if not found or not v_session.broadcasting then
    raise exception 'No active tactical broadcast';
  end if;

  select (m.layout->>'width')::integer, (m.layout->>'height')::integer
  into v_width, v_height from public.combat_maps m
  where m.id = v_session.map_id and m.campaign_id = v_campaign;
  if p_x is null or p_y is null or p_x < 0 or p_y < 0
     or p_x >= v_width or p_y >= v_height then
    raise exception 'Position outside map bounds';
  end if;

  select (u.ordinality - 1)::integer, u.value into v_index, v_unit
  from jsonb_array_elements(v_session.units) with ordinality as u(value, ordinality)
  where u.value->>'key' = p_marker_key
    and u.value->>'type' = 'player'
    and u.value->>'characterId' = p_character_id::text;
  if v_index is null then raise exception 'Marker not assigned to this character'; end if;

  v_units := jsonb_set(v_session.units, array[v_index::text],
    jsonb_set(jsonb_set(v_unit, '{x}', to_jsonb(p_x)), '{y}', to_jsonb(p_y)));

  update public.combat_map_sessions set units = v_units, updated_at = now()
  where campaign_id = v_campaign;
  return true;
end;
$$;
revoke all on function public.move_player_tactical_unit(uuid,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.move_player_tactical_unit(uuid,text,integer,integer)
  to authenticated;
