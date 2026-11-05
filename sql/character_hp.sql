-- Run once in the Supabase SQL Editor before using HP controls.
alter table public.characters add column if not exists current_hp integer;


-- Initialize HP when BODY is first assigned; clamp HP if BODY later decreases.
-- This trigger also covers character creation through create_player_character().
create or replace function public.sync_character_hp_from_body()
returns trigger
language plpgsql security definer set search_path = ''
as $
declare
  v_is_body boolean;
  v_max integer;
begin
  select exists (
    select 1 from public.stat_definitions d
    where d.id = new.stat_id and d.name = 'Body'
  ) into v_is_body;
  if not v_is_body then return new; end if;
  v_max := 10 + 5 * new.value;
  update public.characters
  set current_hp = case
    when current_hp is null then v_max
    else greatest(0, least(current_hp, v_max))
  end
  where id = new.character_id;
  return new;
end;
$;

drop trigger if exists character_body_hp_sync on public.character_stats;
create trigger character_body_hp_sync
after insert or update of value, stat_id on public.character_stats
for each row execute function public.sync_character_hp_from_body();

-- Prevent direct writes from setting HP outside [0, maximum].
create or replace function public.clamp_character_hp()
returns trigger
language plpgsql security definer set search_path = ''
as $
declare
  v_body integer;
begin
  if new.current_hp is null then return new; end if;
  select s.value into v_body
  from public.character_stats s
  join public.stat_definitions d on d.id = s.stat_id
  where s.character_id = new.id and d.name = 'Body'
  limit 1;
  if v_body is not null then
    new.current_hp := greatest(0, least(new.current_hp, 10 + 5 * v_body));
  else
    new.current_hp := greatest(0, new.current_hp);
  end if;
  return new;
end;
$;

drop trigger if exists character_hp_bounds on public.characters;
create trigger character_hp_bounds
before insert or update of current_hp on public.characters
for each row execute function public.clamp_character_hp();

-- Backfill existing characters only if HP has not been assigned yet.
update public.characters c
set current_hp = 10 + 5 * s.value
from public.character_stats s
join public.stat_definitions d on d.id = s.stat_id
where s.character_id = c.id and d.name = 'Body' and c.current_hp is null;

-- GM-only atomic HP adjustments; prevents concurrent clicks from losing updates.
create or replace function public.gm_adjust_character_hp(p_character_id uuid, p_delta integer)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_body integer;
  v_current integer;
  v_max integer;
  v_new integer;
begin
  select c.current_hp, s.value into v_current, v_body
  from public.characters c
  join public.character_stats s on s.character_id = c.id
  join public.stat_definitions d on d.id = s.stat_id and d.name = 'Body'
  join public.campaigns camp on camp.id = c.campaign_id
  where c.id = p_character_id and camp.gm_id = auth.uid()
  for update of c;
  if not found then raise exception 'Character not found or access denied'; end if;
  if p_delta not in (-5, 5) then raise exception 'HP adjustment must be +5 or -5'; end if;
  v_max := 10 + 5 * v_body;
  v_new := greatest(0, least(v_max, coalesce(v_current, v_max) + p_delta));
  update public.characters set current_hp = v_new where id = p_character_id;
  return v_new;
end;
$$;
revoke all on function public.gm_adjust_character_hp(uuid, integer) from public;
grant execute on function public.gm_adjust_character_hp(uuid, integer) to authenticated;
