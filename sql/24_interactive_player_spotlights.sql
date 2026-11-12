-- 24 - Interactive player spotlights (Tarot and Fortune Cookie)
-- Run in Supabase SQL Editor before testing player delivery.
create table if not exists public.player_spotlights (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null check (kind in ('tarot','fortune')),
  outcome jsonb not null,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  closed_at timestamptz
);
create index if not exists player_spotlights_pending_idx
  on public.player_spotlights(character_id,created_at) where closed_at is null;
alter table public.player_spotlights enable row level security;

drop policy if exists "GM manages campaign spotlights" on public.player_spotlights;
create policy "GM manages campaign spotlights" on public.player_spotlights
for all to authenticated
using (exists (select 1 from public.campaigns c where c.id = player_spotlights.campaign_id and c.gm_id = (select auth.uid())))
with check (
  exists (select 1 from public.campaigns c where c.id = player_spotlights.campaign_id and c.gm_id = (select auth.uid()))
  and exists (select 1 from public.characters ch where ch.id = player_spotlights.character_id and ch.campaign_id = player_spotlights.campaign_id)
);

drop policy if exists "Player reads assigned spotlights" on public.player_spotlights;
create policy "Player reads assigned spotlights" on public.player_spotlights
for select to authenticated
using (exists (select 1 from public.characters ch
  where ch.id = player_spotlights.character_id
  and ch.campaign_id = player_spotlights.campaign_id
  and ch.player_id = (select auth.uid())));

create or replace function public.reveal_player_spotlight(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare s public.player_spotlights%rowtype; label text; msg text;
  names text[] := array['The Fool','The Magician','The High Priestess','The Empress','The Emperor','The Hierophant','The Lovers','The Chariot','Strength','The Hermit','Wheel of Fortune','Justice','The Hanged Man','Death','Temperance','The Devil','The Tower','The Star','The Moon','The Sun','Judgement','The World'];
begin
  select * into s from public.player_spotlights where id = p_id for update;
  if not found or not exists (select 1 from public.characters ch where ch.id=s.character_id and ch.campaign_id=s.campaign_id and ch.player_id=auth.uid()) then
    raise exception 'Spotlight not found or access denied';
  end if;
  if s.closed_at is not null then raise exception 'Spotlight already closed'; end if;
  if s.revealed_at is null then
    if s.kind = 'tarot' then
      if (s.outcome->>'index')::int not between 0 and 21 or jsonb_typeof(s.outcome->'reversed') <> 'boolean' then raise exception 'Invalid tarot outcome'; end if;
      label := names[(s.outcome->>'index')::int + 1];
      msg := 'TAROT REVEALED: ' || label || ' (' || case when (s.outcome->>'reversed')::boolean then 'Reversed' else 'Upright' end || ')';
    else
      if jsonb_typeof(s.outcome->'message') <> 'string' or jsonb_typeof(s.outcome->'numbers') <> 'array' then raise exception 'Invalid fortune outcome'; end if;
      msg := 'FORTUNE REVEALED: ' || (s.outcome->>'message') || ' | Lucky numbers: ' || (select string_agg(v, ', ' order by ord) from jsonb_array_elements_text(s.outcome->'numbers') with ordinality as x(v,ord));
    end if;
    update public.player_spotlights set revealed_at = now() where id = p_id;
    insert into public.campaign_events(campaign_id,character_id,audience,category,message)
    values(s.campaign_id,s.character_id,'character','system',msg);
  end if;
  return s.outcome;
end;
$$;

create or replace function public.close_player_spotlight(p_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare s public.player_spotlights%rowtype;
begin
  select * into s from public.player_spotlights where id=p_id for update;
  if not found or not exists (select 1 from public.characters ch where ch.id=s.character_id and ch.campaign_id=s.campaign_id and ch.player_id=auth.uid()) then
    raise exception 'Spotlight not found or access denied';
  end if;
  if s.revealed_at is null then raise exception 'Reveal the spotlight before closing'; end if;
  update public.player_spotlights set closed_at=coalesce(closed_at,now()) where id=p_id;
end;
$$;
revoke all on function public.reveal_player_spotlight(uuid) from public;
revoke all on function public.close_player_spotlight(uuid) from public;
grant execute on function public.reveal_player_spotlight(uuid) to authenticated;
grant execute on function public.close_player_spotlight(uuid) to authenticated;
grant select, insert on public.player_spotlights to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.player_spotlights;
exception when duplicate_object then null;
end $$;
