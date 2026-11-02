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
