-- Ghost//Link simulated calls. Apply this migration in Supabase SQL Editor before testing.
-- The player and GM use authenticated RPCs; raw call rows are never exposed to clients.
create table if not exists public.phone_calls (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 npc_identity_id uuid not null references public.phone_identities(id),
 character_id uuid not null references public.characters(id) on delete cascade,
 status text not null default 'ringing' check (status in ('ringing','connected','declined','missed','cancelled','ended')),
 created_at timestamptz not null default now(),
 answered_at timestamptz,
 ended_at timestamptz
);
create unique index if not exists phone_calls_one_active_character on public.phone_calls(character_id) where status in ('ringing','connected');
create unique index if not exists phone_calls_one_active_campaign on public.phone_calls(campaign_id) where status in ('ringing','connected');
create index if not exists phone_calls_campaign_created on public.phone_calls(campaign_id,created_at desc);
alter table public.phone_calls enable row level security;
revoke all on public.phone_calls from public,anon,authenticated;

create or replace function public.phone_gm_start_call(p_campaign_id uuid,p_npc_identity_id uuid,p_character_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
 if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then raise exception 'Not authorized for campaign'; end if;
 if not exists(select 1 from public.phone_identities i where i.id=p_npc_identity_id and i.campaign_id=p_campaign_id and i.kind='npc') then raise exception 'Invalid NPC identity'; end if;
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.campaign_id=p_campaign_id) then raise exception 'Invalid recipient'; end if;
 update public.phone_calls set status='missed',ended_at=now() where campaign_id=p_campaign_id and status='ringing' and created_at<now()-interval '45 seconds';
 insert into public.phone_calls(campaign_id,npc_identity_id,character_id) values(p_campaign_id,p_npc_identity_id,p_character_id) returning id into v_id;
 return v_id;
end;$$;

create or replace function public.phone_gm_calls(p_campaign_id uuid)
returns table(id uuid,npc_identity_id uuid,character_id uuid,status text,created_at timestamptz,answered_at timestamptz,ended_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then raise exception 'Not authorized for campaign'; end if;
 update public.phone_calls pc set status='missed',ended_at=now() where pc.campaign_id=p_campaign_id and pc.status='ringing' and pc.created_at<now()-interval '45 seconds';
 return query select pc.id,pc.npc_identity_id,pc.character_id,pc.status,pc.created_at,pc.answered_at,pc.ended_at from public.phone_calls pc where pc.campaign_id=p_campaign_id order by pc.created_at desc limit 60;
end;$$;

create or replace function public.phone_gm_end_call(p_call_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 update public.phone_calls pc set status=case when pc.status='ringing' then 'cancelled' else 'ended' end,ended_at=now()
 where pc.id=p_call_id and pc.status in ('ringing','connected')
 and exists(select 1 from public.campaigns c where c.id=pc.campaign_id and c.gm_id=auth.uid());
 if not found then raise exception 'Call not found or not authorized'; end if;
end;$$;

create or replace function public.phone_player_current_call(p_character_id uuid)
returns table(id uuid,status text,caller_label text,created_at timestamptz,answered_at timestamptz,ended_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid()) then raise exception 'Not authorized for character'; end if;
 update public.phone_calls pc set status='missed',ended_at=now() where pc.character_id=p_character_id and pc.status='ringing' and pc.created_at<now()-interval '45 seconds';
 return query select pc.id,pc.status,
 (case when i.anonymous then 'Unknown Number' else i.display_name end)::text,
 pc.created_at,pc.answered_at,pc.ended_at
 from public.phone_calls pc join public.phone_identities i on i.id=pc.npc_identity_id
 where pc.character_id=p_character_id and pc.status in ('ringing','connected')
 order by pc.created_at desc limit 1;
end;$$;

create or replace function public.phone_player_call_action(p_character_id uuid,p_call_id uuid,p_action text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid()) then raise exception 'Not authorized for character'; end if;
 if p_action='answer' then
  update public.phone_calls pc set status='connected',answered_at=now() where pc.id=p_call_id and pc.character_id=p_character_id and pc.status='ringing' and pc.created_at>=now()-interval '45 seconds';
 elsif p_action='decline' then
  update public.phone_calls pc set status='declined',ended_at=now() where pc.id=p_call_id and pc.character_id=p_character_id and pc.status='ringing';
 elsif p_action='end' then
  update public.phone_calls pc set status='ended',ended_at=now() where pc.id=p_call_id and pc.character_id=p_character_id and pc.status='connected';
 else raise exception 'Invalid call action';
 end if;
 if not found then raise exception 'Call already changed or no longer available'; end if;
end;$$;

create or replace function public.phone_player_call_history(p_character_id uuid)
returns table(id uuid,status text,caller_label text,created_at timestamptz,answered_at timestamptz,ended_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid()) then raise exception 'Not authorized for character'; end if;
 return query select pc.id,pc.status,(case when i.anonymous then 'Unknown Number' else i.display_name end)::text,pc.created_at,pc.answered_at,pc.ended_at
 from public.phone_calls pc join public.phone_identities i on i.id=pc.npc_identity_id
 where pc.character_id=p_character_id and pc.status not in ('ringing','connected') order by pc.created_at desc limit 50;
end;$$;
revoke all on function public.phone_gm_start_call(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.phone_gm_calls(uuid) from public,anon,authenticated;
revoke all on function public.phone_gm_end_call(uuid) from public,anon,authenticated;
revoke all on function public.phone_player_current_call(uuid) from public,anon,authenticated;
revoke all on function public.phone_player_call_action(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.phone_player_call_history(uuid) from public,anon,authenticated;
grant execute on function public.phone_gm_start_call(uuid,uuid,uuid) to authenticated;
grant execute on function public.phone_gm_calls(uuid) to authenticated;
grant execute on function public.phone_gm_end_call(uuid) to authenticated;
grant execute on function public.phone_player_current_call(uuid) to authenticated;
grant execute on function public.phone_player_call_action(uuid,uuid,text) to authenticated;
grant execute on function public.phone_player_call_history(uuid) to authenticated;
