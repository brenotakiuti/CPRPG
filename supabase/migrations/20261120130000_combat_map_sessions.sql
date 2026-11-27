-- GM-owned live combat state. Player-facing broadcasts will use a separate
-- filtered read API so hidden enemies are never exposed to player clients.
create table if not exists public.combat_map_sessions (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  map_id uuid not null references public.combat_maps(id) on delete cascade,
  broadcasting boolean not null default false,
  units jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint combat_map_units_array check (jsonb_typeof(units) = 'array')
);
alter table public.combat_map_sessions enable row level security;
create policy "GM can read live combat sessions"
  on public.combat_map_sessions for select to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid()));
create policy "GM can insert live combat sessions"
  on public.combat_map_sessions for insert to authenticated
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
    and exists (select 1 from public.combat_maps m where m.id = map_id and m.campaign_id = campaign_id));
create policy "GM can update live combat sessions"
  on public.combat_map_sessions for update to authenticated
  using (exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid()))
  with check (exists (select 1 from public.campaigns c where c.id = campaign_id and c.gm_id = auth.uid())
    and exists (select 1 from public.combat_maps m where m.id = map_id and m.campaign_id = campaign_id));
-- Realtime publication for GM-side updates.
do $$ begin
  alter publication supabase_realtime add table public.combat_map_sessions;
exception when duplicate_object then null;
end $$;
