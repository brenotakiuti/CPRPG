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
