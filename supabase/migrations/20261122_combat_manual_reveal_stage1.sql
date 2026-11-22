-- Stage 1: broadcast-scoped enemy reveal mode.
-- Apply in Supabase SQL Editor before using the new GM selector.
alter table public.combat_map_sessions
  add column if not exists reveal_mode text not null default 'automatic'
  check (reveal_mode in ('automatic','manual'));

-- Preserve the existing RPC and all its authorization/visibility logic.
-- Rename once, then expose the same RPC name with a lightweight response adapter.
do $$
begin
  if to_regprocedure('public.get_player_tactical_feed(uuid)') is null then
    raise exception 'Expected get_player_tactical_feed(uuid) RPC not found';
  end if;
  if to_regprocedure('public.get_player_tactical_feed_automatic(uuid)') is null then
    alter function public.get_player_tactical_feed(uuid)
      rename to get_player_tactical_feed_automatic;
  end if;
end $$;

-- The internal automatic implementation must not be callable directly by players.
revoke execute on function public.get_player_tactical_feed_automatic(uuid) from public, anon, authenticated;

create or replace function public.get_player_tactical_feed(p_character_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  mode text;
begin
  payload := public.get_player_tactical_feed_automatic(p_character_id)::jsonb;
  if payload is null then return null; end if;
  select s.reveal_mode into mode
    from public.combat_map_sessions s
    where s.map_id = nullif(payload->>'mapId','')::uuid
      and s.broadcasting
    limit 1;
  mode := coalesce(mode,'automatic');
  -- In manual mode, Stage 1 exposes no enemy/target/objective positions.
  -- Stage 2 will introduce explicit GM per-layer reveal instructions.
  if mode='manual' then
    payload := jsonb_set(payload,'{units}',
      coalesce((
        select jsonb_agg(u)
        from jsonb_array_elements(coalesce(payload->'units','[]'::jsonb)) u
        where u->>'type'='player'
      ),'[]'::jsonb),true);
  end if;
  return jsonb_set(payload,'{revealMode}',to_jsonb(mode),true);
end $$;

grant execute on function public.get_player_tactical_feed(uuid) to authenticated;
