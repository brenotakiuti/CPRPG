-- CPRPG - Cumulative Supabase feature updates
-- Run in Supabase SQL Editor after reviewing each change.
-- This file is append-only for new feature setup; keep sections idempotent
-- wherever possible so the full script can be rerun safely.
--
-- Existing database tables, RPCs and policies are managed separately.
-- Do not place service-role secrets in this repository.

-- ============================================================
-- 01. GM Console: Realtime character assignment updates
-- ============================================================
-- Supabase Postgres Changes only emits changes for tables included
-- in the supabase_realtime publication.
-- Adding the table once enables the frontend's UPDATE subscription.
-- Check the publication first to avoid "already member" errors.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'characters'
  ) then
    alter publication supabase_realtime add table public.characters;
  end if;
end
$$;


-- ============================================================
-- 02. Campaign character-creation links and GM enable switch
-- ============================================================
-- Each campaign gets a stable, random link token. Existing campaigns
-- are backfilled; new campaigns start with creation disabled.
-- The token is never rotated by logging in or toggling the switch.
alter table public.campaigns
  add column if not exists character_creation_token uuid
    not null default gen_random_uuid();

alter table public.campaigns
  add column if not exists character_creation_enabled boolean
    not null default false;

-- The GM reads the token and current state through an ownership-checked RPC.
-- Avoid exposing the token through a public campaigns SELECT policy.
create or replace function public.get_character_creation_settings(p_campaign_id uuid)
returns table (creation_token uuid, creation_enabled boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
    select c.character_creation_token, c.character_creation_enabled
    from public.campaigns c
    where c.id = p_campaign_id and c.gm_id = auth.uid();
  if not found then
    raise exception 'Campaign not found or access denied';
  end if;
end;
$$;

revoke all on function public.get_character_creation_settings(uuid)
  from public, anon, authenticated;
grant execute on function public.get_character_creation_settings(uuid)
  to authenticated;

-- Changing this flag affects ONLY new-character creation.
-- It does not revoke existing characters or GM invitations.
create or replace function public.set_character_creation_enabled(
  p_campaign_id uuid, p_enabled boolean
)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if p_enabled is null then
    raise exception 'Enabled state is required';
  end if;

  update public.campaigns
  set character_creation_enabled = p_enabled
  where id = p_campaign_id and gm_id = auth.uid();

  if not found then
    raise exception 'Campaign not found or access denied';
  end if;

  return p_enabled;
end;
$$;

revoke all on function public.set_character_creation_enabled(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_character_creation_enabled(uuid, boolean)
  to authenticated;

-- The player-side character creation transaction and page will be added
-- separately, after the character sheet has been designed.


-- ============================================================
-- 03. Player link: resolve campaign and check creation switch
-- ============================================================
-- A player may inspect the campaign name and availability using
-- the permanent token, without being granted GM permissions.
-- The creation form will later use a separate atomic RPC which
-- rechecks this switch at submission time.
create or replace function public.get_character_creation_campaign(p_token uuid)
returns table (campaign_id uuid, campaign_name text, creation_enabled boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
    select c.id, c.name::text, c.character_creation_enabled
    from public.campaigns c
    where c.character_creation_token = p_token;
end;
$$;

revoke all on function public.get_character_creation_campaign(uuid)
  from public, anon, authenticated;
grant execute on function public.get_character_creation_campaign(uuid)
  to authenticated;

create unique index if not exists campaigns_character_creation_token_key
  on public.campaigns(character_creation_token);

-- ============================================================
-- 04. GM Bank: securely withdraw money from a character
-- ============================================================
-- GM / Bank as recipient removes funds from circulation.
-- Only the campaign's GM can call this function. It locks the
-- character row to prevent simultaneous withdrawals overdrawing.
create or replace function public.withdraw_money(
  p_character_id uuid, p_amount bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance bigint;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be a positive whole number';
  end if;

  select ch.balance into v_balance
  from public.characters ch
  join public.campaigns ca on ca.id = ch.campaign_id
  where ch.id = p_character_id and ca.gm_id = auth.uid()
  for update of ch;

  if not found then
    raise exception 'Character not found or access denied';
  end if;

  if v_balance < p_amount then
    raise exception 'Insufficient funds';
  end if;

  update public.characters
  set balance = balance - p_amount
  where id = p_character_id;
end;
$$;

revoke all on function public.withdraw_money(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.withdraw_money(uuid, bigint)
  to authenticated;


-- ============================================================
-- 05. GM character sheet: read campaign stats
-- ============================================================
-- Requires the stat_definitions and character_stats tables created
-- earlier in the Supabase SQL Editor.
-- Only the authenticated GM who owns the campaign may read stats.
-- No INSERT, UPDATE or DELETE policies are granted here.
grant select on public.stat_definitions to authenticated;
grant select on public.character_stats to authenticated;

drop policy if exists "GM reads campaign stat definitions"
  on public.stat_definitions;
create policy "GM reads campaign stat definitions"
on public.stat_definitions for select to authenticated
using (
  exists (
    select 1 from public.campaigns ca
    where ca.id = stat_definitions.campaign_id
      and ca.gm_id = (select auth.uid())
  )
);

drop policy if exists "GM reads campaign character stats"
  on public.character_stats;
create policy "GM reads campaign character stats"
on public.character_stats for select to authenticated
using (
  exists (
    select 1 from public.campaigns ca
    where ca.id = character_stats.campaign_id
      and ca.gm_id = (select auth.uid())
  )
);

-- ============================================================
-- 06. Player character creation: atomic character + attributes
-- ============================================================
-- Run this section in Supabase SQL Editor before testing the button.
-- Assumes characters(id, campaign_id, player_id, name, balance),
-- stat_definitions(id, campaign_id, name) and
-- character_stats(character_id, campaign_id, stat_id, value).
-- This function deliberately does not grant direct INSERT access.
create or replace function public.create_player_character(
  p_token uuid, p_name text, p_attributes jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign_id uuid;
  v_character_id uuid;
  v_stat record;
  v_value integer;
  v_total integer := 0;
  v_count integer := 0;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'Anonymous player session required';
  end if;
  if p_name is null or length(btrim(p_name)) < 1 or length(btrim(p_name)) > 60 then
    raise exception 'Character name must be 1 to 60 characters';
  end if;
  if p_attributes is null or jsonb_typeof(p_attributes) <> 'object'
    or (select count(*) from jsonb_object_keys(p_attributes)) <> 5 then
    raise exception 'Exactly five attributes are required';
  end if;

  -- Serialize submissions from the same player to avoid duplicate characters.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select c.id into v_campaign_id
  from public.campaigns c
  where c.character_creation_token = p_token
    and c.character_creation_enabled = true
  for update;
  if not found then
    raise exception 'Invalid link or character creation is disabled';
  end if;

  if exists (select 1 from public.characters ch where ch.player_id = v_user_id) then
    raise exception 'This player session already has a character';
  end if;

  for v_stat in
    select d.id, d.name
    from public.stat_definitions d
    where d.campaign_id = v_campaign_id
      and d.name in ('Body', 'Reflexes', 'Technical Ability', 'Intelligence', 'Cool')
  loop
    v_count := v_count + 1;
    if not (p_attributes ? v_stat.name) or
       jsonb_typeof(p_attributes->v_stat.name) <> 'number' or
       (p_attributes->>v_stat.name) !~ '^[0-9]+$' then
      raise exception 'Missing or invalid attribute: %', v_stat.name;
    end if;
    v_value := (p_attributes->>v_stat.name)::integer;
    if v_value < 1 or v_value > 20 then
      raise exception 'Attribute % must be between 1 and 20', v_stat.name;
    end if;
    v_total := v_total + v_value;
  end loop;
  if v_count <> 5 or v_total <> 30 then
    raise exception 'Five campaign attributes totaling 30 points are required';
  end if;

  insert into public.characters (campaign_id, player_id, name, balance)
  values (v_campaign_id, v_user_id, btrim(p_name), 0)
  returning id into v_character_id;

  insert into public.character_stats (character_id, campaign_id, stat_id, value)
  select v_character_id, v_campaign_id, d.id, (p_attributes->>d.name)::integer
  from public.stat_definitions d
  where d.campaign_id = v_campaign_id
    and d.name in ('Body', 'Reflexes', 'Technical Ability', 'Intelligence', 'Cool');

  return v_character_id;
end;
$$;

revoke all on function public.create_player_character(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_player_character(uuid, text, jsonb)
  to authenticated;
