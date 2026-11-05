-- Run once in the Supabase SQL Editor before using HP controls.
alter table public.characters add column if not exists current_hp integer;

-- Populate existing characters using their BODY stat.
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
