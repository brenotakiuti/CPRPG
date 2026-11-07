-- Run once in Supabase SQL Editor BEFORE deploying the database-driven HUD.
-- Existing NULL-recipient entries remain GM-only.
alter table public.campaign_events
  add column if not exists audience text not null default 'gm';

alter table public.campaign_events
  drop constraint if exists campaign_events_audience_check;
alter table public.campaign_events
  add constraint campaign_events_audience_check
  check (audience in ('gm', 'campaign', 'character'));

alter table public.campaign_events
  drop constraint if exists campaign_events_recipient_check;
alter table public.campaign_events
  add constraint campaign_events_recipient_check
  check (
    (audience = 'character' and character_id is not null)
    or (audience in ('gm', 'campaign') and character_id is null)
  );

drop policy if exists "Assigned players can read their own events" on public.campaign_events;
create policy "Assigned players can read their own events"
on public.campaign_events for select to authenticated
using (
  (
    audience = 'character'
    and character_id is not null
    and exists (
      select 1 from public.characters c
      where c.id = character_id
        and c.campaign_id = campaign_id
        and c.player_id = (select auth.uid())
    )
  )
  or (
    audience = 'campaign'
    and exists (
      select 1 from public.characters c
      where c.campaign_id = campaign_id
        and c.player_id = (select auth.uid())
    )
  )
);

-- Restrict event creation to GMs (existing INSERT policy remains).
-- Never expose GM-only events by setting audience='campaign'.
