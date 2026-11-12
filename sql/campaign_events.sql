-- Central campaign activity log (run in the Supabase SQL Editor).
-- Producers format their own messages. Null character_id means GM-only.
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  category text not null check (category in ('system', 'text')),
  message text not null check (length(btrim(message)) between 1 and 4000),
  created_at timestamptz not null default now(),
  unique (id, campaign_id)
);

create index if not exists campaign_events_campaign_time_idx
  on public.campaign_events (campaign_id, created_at desc);
create index if not exists campaign_events_character_time_idx
  on public.campaign_events (character_id, created_at desc)
  where character_id is not null;

-- Ensure recipient belongs to the event's campaign, even for future producers.
create or replace function public.validate_campaign_event_recipient()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.character_id is not null and not exists (
    select 1 from public.characters c
    where c.id = new.character_id and c.campaign_id = new.campaign_id
  ) then
    raise exception 'Event recipient does not belong to campaign';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_campaign_event_recipient on public.campaign_events;
create trigger validate_campaign_event_recipient
before insert or update of campaign_id, character_id on public.campaign_events
for each row execute function public.validate_campaign_event_recipient();

alter table public.campaign_events enable row level security;

drop policy if exists "GM can read campaign events" on public.campaign_events;
create policy "GM can read campaign events"
on public.campaign_events for select to authenticated
using (exists (
  select 1 from public.campaigns c
  where c.id = campaign_id and c.gm_id = (select auth.uid())
));

drop policy if exists "Assigned players can read their own events" on public.campaign_events;
create policy "Assigned players can read their own events"
on public.campaign_events for select to authenticated
using (
  character_id is not null and exists (
    select 1 from public.characters c
    where c.id = character_id
      and c.campaign_id = campaign_id
      and c.player_id = (select auth.uid())
  )
);

drop policy if exists "GM can insert campaign events" on public.campaign_events;
create policy "GM can insert campaign events"
on public.campaign_events for insert to authenticated
with check (exists (
  select 1 from public.campaigns c
  where c.id = campaign_id and c.gm_id = (select auth.uid())
));

-- No update or delete policies: entries are append-only for clients.
-- Existing privileged server-side RPCs can insert events in the same
-- transaction as the action, after checking their own authorization.
revoke all on public.campaign_events from anon;
grant select, insert on public.campaign_events to authenticated;

-- Realtime postgres_changes respects row visibility under RLS.
-- A new row can notify the GM and its assigned character only.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'campaign_events'
  ) then
    alter publication supabase_realtime add table public.campaign_events;
  end if;
end $$;
