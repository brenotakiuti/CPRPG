-- Add GM-controlled enemy statuses to the authorized Tactical//Feed payload.
-- Run after 20261122_combat_manual_reveal_stage2.sql.
-- The existing automatic RPC continues to enforce character access and visibility.
create or replace function public.get_player_tactical_feed(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  mode text;
  session_units jsonb;
  safe_units jsonb;
begin
  payload := public.get_player_tactical_feed_automatic(p_character_id)::jsonb;
  if payload is null then return null; end if;

  select s.reveal_mode, s.units
    into mode, session_units
    from public.combat_map_sessions s
    where s.map_id = nullif(payload->>'mapId','')::uuid
      and s.broadcasting
    limit 1;
  mode := coalesce(mode, 'automatic');

  -- Preserve Stage 2's manual per-scanner visibility filtering.
  if mode = 'manual' then
    select coalesce(jsonb_agg(
      case when unit->>'type' = 'player' then unit
      else jsonb_set(unit, '{manualReveal}',
                    coalesce(gm_unit->'manualReveal','{}'::jsonb), true)
      end
    ), '[]'::jsonb)
    into safe_units
    from jsonb_array_elements(coalesce(payload->'units','[]'::jsonb)) as unit
    left join lateral (
      select candidate as gm_unit
      from jsonb_array_elements(coalesce(session_units,'[]'::jsonb)) as candidate
      where candidate->>'key' = unit->>'key'
      limit 1
    ) gm on true
    where unit->>'type' = 'player'
       or exists (
         select 1
         from jsonb_each_text(coalesce(gm_unit->'manualReveal','{}'::jsonb)) as flag(layer,value)
         where flag.layer in ('tactical','night','thermal','acoustic','network')
           and flag.value in ('revealed','direction')
       );
    payload := jsonb_set(payload, '{units}', safe_units, true);
  end if;

  -- Enrich only units that already passed the visibility filters.
  -- Never expose statuses or positions for units absent from the payload.
  select coalesce(jsonb_agg(
    case when unit->>'type' = 'enemy'
      then jsonb_set(unit, '{status}',
        to_jsonb(case when gm_unit->>'status' in ('normal','unconscious','dead')
                      then gm_unit->>'status' else 'normal' end), true)
      else unit
    end
  ), '[]'::jsonb)
  into safe_units
  from jsonb_array_elements(coalesce(payload->'units','[]'::jsonb)) as unit
  left join lateral (
    select candidate as gm_unit
    from jsonb_array_elements(coalesce(session_units,'[]'::jsonb)) as candidate
    where candidate->>'key' = unit->>'key'
      and candidate->>'type' = 'enemy'
    limit 1
  ) gm on true;

  payload := jsonb_set(payload, '{units}', safe_units, true);
  return jsonb_set(payload, '{revealMode}', to_jsonb(mode), true);
end $$;

revoke execute on function public.get_player_tactical_feed_automatic(uuid)
  from public, anon, authenticated;
revoke all on function public.get_player_tactical_feed(uuid)
  from public, anon, authenticated;
grant execute on function public.get_player_tactical_feed(uuid)
  to authenticated;
