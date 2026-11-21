-- Apply this migration in Supabase SQL Editor before testing saved maps.
create table if not exists public.combat_maps (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 100),
 width integer not null check (width between 4 and 30),
 height integer not null check (height between 4 and 30),
 layout jsonb not null default '{"version":1,"objects":[]}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists combat_maps_campaign_idx on public.combat_maps(campaign_id);
alter table public.combat_maps enable row level security;
drop policy if exists "GM manages own campaign maps" on public.combat_maps;
create policy "GM manages own campaign maps" on public.combat_maps
 for all to authenticated
 using (exists(select 1 from public.campaigns c where c.id=combat_maps.campaign_id and c.gm_id=auth.uid()))
 with check (exists(select 1 from public.campaigns c where c.id=combat_maps.campaign_id and c.gm_id=auth.uid()));
create or replace function public.combat_maps_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at=now();return new;end $$;
drop trigger if exists combat_maps_updated_at on public.combat_maps;
create trigger combat_maps_updated_at before update on public.combat_maps
 for each row execute function public.combat_maps_touch_updated_at();
