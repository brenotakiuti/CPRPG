-- Contact delivery: transactional GM distribution and persistent player notifications.
create table if not exists public.phone_contact_notifications (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  npc_identity_id uuid not null references public.phone_identities(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists phone_contact_notifications_character_idx
  on public.phone_contact_notifications(character_id,created_at desc);
alter table public.phone_contact_notifications enable row level security;
revoke all on public.phone_contact_notifications from public,anon,authenticated;
grant select on public.phone_contact_notifications to authenticated;
drop policy if exists phone_contact_notifications_player_select on public.phone_contact_notifications;
create policy phone_contact_notifications_player_select on public.phone_contact_notifications
  for select to authenticated using (
    exists(select 1 from public.characters ch where ch.id=character_id and ch.player_id=auth.uid())
  );
-- Realtime requires publication membership and a SELECT policy for the recipient.
do $$ begin
  if not exists(select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='phone_contact_notifications') then
    alter publication supabase_realtime add table public.phone_contact_notifications;
  end if;
end $$;

create or replace function public.phone_gm_distribute_contact(
  p_campaign_id uuid,p_npc_identity_id uuid,p_character_ids uuid[])
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  v_character_id uuid;
  v_added integer := 0;
  v_inserted integer;
begin
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for campaign';
  end if;
  if not exists(select 1 from public.phone_identities i
    where i.id=p_npc_identity_id and i.campaign_id=p_campaign_id and i.kind='npc') then
    raise exception 'Invalid NPC identity';
  end if;
  if p_character_ids is null or cardinality(p_character_ids)=0 then
    raise exception 'Select at least one recipient';
  end if;
  for v_character_id in select distinct unnest(p_character_ids) loop
    if not exists(select 1 from public.characters ch where ch.id=v_character_id and ch.campaign_id=p_campaign_id) then
      raise exception 'Invalid player character: %',v_character_id;
    end if;
    insert into public.phone_contact_grants(campaign_id,npc_identity_id,character_id)
      values(p_campaign_id,p_npc_identity_id,v_character_id)
      on conflict (npc_identity_id,character_id) do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted=1 then
      insert into public.phone_contact_notifications(campaign_id,character_id,npc_identity_id)
        values(p_campaign_id,v_character_id,p_npc_identity_id);
      v_added:=v_added+1;
    end if;
  end loop;
  return v_added;
end;
$$;

create or replace function public.phone_player_contact_notifications(p_character_id uuid)
returns table(id uuid,npc_identity_id uuid,label text,created_at timestamptz,read_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid()) then
    raise exception 'Not authorized for character';
  end if;
  return query select n.id,n.npc_identity_id,
    (case when i.anonymous then 'Unknown Number' else i.display_name end)::text,
    n.created_at,n.read_at
    from public.phone_contact_notifications n
    join public.phone_identities i on i.id=n.npc_identity_id
    where n.character_id=p_character_id
    order by n.created_at desc limit 100;
end;
$$;

create or replace function public.phone_player_mark_contact_notifications_read(p_character_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid()) then
    raise exception 'Not authorized for character';
  end if;
  update public.phone_contact_notifications n set read_at=now()
    where n.character_id=p_character_id and n.read_at is null;
end;
$$;
revoke all on function public.phone_gm_distribute_contact(uuid,uuid,uuid[]) from public,anon,authenticated;
revoke all on function public.phone_player_contact_notifications(uuid) from public,anon,authenticated;
revoke all on function public.phone_player_mark_contact_notifications_read(uuid) from public,anon,authenticated;
grant execute on function public.phone_gm_distribute_contact(uuid,uuid,uuid[]) to authenticated;
grant execute on function public.phone_player_contact_notifications(uuid) to authenticated;
grant execute on function public.phone_player_mark_contact_notifications_read(uuid) to authenticated;
