-- Stage 2: GM-controlled per-layer reveals.
-- Run after 20261122_combat_manual_reveal_stage1.sql.
-- Preserves the original automatic RPC and its existing authorization checks.
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
  mode := coalesce(mode,'automatic');

  if mode='manual' then
    -- Never send units hidden in every layer.
    -- Player positions remain available as before.
    -- Read manual reveal instructions from the GM-controlled session record,
    -- not from untrusted player input.
    select coalesce(jsonb_agg(
      case when unit->>'type'='player' then unit
      else jsonb_set(unit,'{manualReveal}',coalesce(gm_unit->'manualReveal','{}'::jsonb),true)
      end
    ),'[]'::jsonb)
    into safe_units
    from jsonb_array_elements(coalesce(payload->'units','[]'::jsonb)) as unit
    left join lateral (
      select candidate as gm_unit
      from jsonb_array_elements(coalesce(session_units,'[]'::jsonb)) as candidate
      where candidate->>'key'=unit->>'key'
      limit 1
    ) gm on true
    where unit->>'type'='player'
       or exists (
         select 1
         from jsonb_each_text(coalesce(gm_unit->'manualReveal','{}'::jsonb)) as flag(layer,value)
         where flag.layer in ('tactical','night','thermal','acoustic','network')
           and flag.value in ('revealed','direction')
       );
    payload := jsonb_set(payload,'{units}',safe_units,true);
  end if;
  return jsonb_set(payload,'{revealMode}',to_jsonb(mode),true);
end $$;

revoke execute on function public.get_player_tactical_feed_automatic(uuid) from public, anon, authenticated;
grant execute on function public.get_player_tactical_feed(uuid) to authenticated;
