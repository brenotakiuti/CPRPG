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
