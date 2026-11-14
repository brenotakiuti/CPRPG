-- Player dice roll history. Execute this migration in Supabase SQL Editor before testing.
-- A roll is a single immutable outcome, regardless of future GM approval.
create table if not exists public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  dice_count integer not null check (dice_count between 1 and 20),
  dice_sides integer not null check (dice_sides in (4,6,8,10,12,20,100)),
  results integer[] not null,
  total integer not null,
  created_at timestamptz not null default now(),
  constraint dice_rolls_result_count check (cardinality(results) = dice_count),
  constraint dice_rolls_result_range check (array_position(results, null) is null),
  constraint dice_rolls_positive_total check (total >= dice_count)
);
create index if not exists dice_rolls_character_time_idx on public.dice_rolls(character_id,created_at desc);
create index if not exists dice_rolls_campaign_time_idx on public.dice_rolls(campaign_id,created_at desc);
alter table public.dice_rolls enable row level security;
drop policy if exists dice_rolls_player_insert on public.dice_rolls;
create policy dice_rolls_player_insert on public.dice_rolls
  for insert to authenticated with check (
    exists (
      select 1 from public.characters c
      where c.id = character_id
        and c.campaign_id = dice_rolls.campaign_id
        and c.player_id = (select auth.uid())
    )
    and total = (select coalesce(sum(v),0) from unnest(results) as v)
    and not exists (select 1 from unnest(results) as v where v < 1 or v > dice_sides)
  );
-- Players can view their own history only. Shared visibility comes with GM approval later.
drop policy if exists dice_rolls_player_select on public.dice_rolls;
create policy dice_rolls_player_select on public.dice_rolls
  for select to authenticated using (
    exists (select 1 from public.characters c where c.id = character_id and c.player_id = (select auth.uid()))
  );
-- No client UPDATE or DELETE policies: outcomes cannot be rewritten.

-- Atomic player roll recording. SECURITY DEFINER validates ownership explicitly,
-- writes the structured result and a GM-only campaign log in one transaction.
create or replace function public.record_player_dice_roll(
  p_character_id uuid,
  p_campaign_id uuid,
  p_dice_sides integer,
  p_results integer[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roll_id uuid;
  v_count integer;
  v_total integer;
  v_name text;
begin
  select c.name into v_name
  from public.characters c
  where c.id = p_character_id
    and c.campaign_id = p_campaign_id
    and c.player_id = auth.uid();
  if v_name is null then raise exception 'Character not owned by current player'; end if;
  v_count := coalesce(cardinality(p_results), 0);
  if v_count < 1 or v_count > 20 or p_dice_sides not in (4,6,8,10,12,20,100) then
    raise exception 'Invalid dice configuration';
  end if;
  if exists (select 1 from unnest(p_results) v where v is null or v < 1 or v > p_dice_sides) then
    raise exception 'Invalid die result';
  end if;
  select sum(v) into v_total from unnest(p_results) v;
  insert into public.dice_rolls(campaign_id,character_id,dice_count,dice_sides,results,total)
  values(p_campaign_id,p_character_id,v_count,p_dice_sides,p_results,v_total)
  returning id into v_roll_id;
  insert into public.campaign_events(campaign_id,character_id,audience,category,message)
  values(p_campaign_id,p_character_id,'gm','system',
    v_name || ' ROLLED ' || v_count || 'D' || p_dice_sides || ' → ' ||
    array_to_string(p_results, ' + ') || ' = ' || v_total || ' [UNAPPROVED]');
  return v_roll_id;
end;
$$;
revoke all on function public.record_player_dice_roll(uuid,uuid,integer,integer[]) from public;
revoke all on function public.record_player_dice_roll(uuid,uuid,integer,integer[]) from anon;
grant execute on function public.record_player_dice_roll(uuid,uuid,integer,integer[]) to authenticated;
