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
