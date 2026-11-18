-- Ghost//Link player-to-NPC calls. Run AFTER both 20261118 call migrations.
-- Existing GM calls remain supported. Contact grants authorize BOTH messaging and calling.
alter table public.phone_calls add column if not exists direction text not null default 'gm';
alter table public.phone_calls drop constraint if exists phone_calls_direction_check;
alter table public.phone_calls add constraint phone_calls_direction_check check (direction in ('gm','player'));

create or replace function public.phone_player_start_call(p_character_id uuid,p_npc_identity_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_campaign_id uuid; v_id uuid;
begin
 select ch.campaign_id into v_campaign_id from public.characters ch
 where ch.id=p_character_id and ch.player_id=auth.uid();
 if v_campaign_id is null then raise exception 'Not authorized for character'; end if;
 if not exists(select 1 from public.phone_contact_grants g
   join public.phone_identities i on i.id=g.npc_identity_id
   where g.character_id=p_character_id and g.npc_identity_id=p_npc_identity_id
   and g.campaign_id=v_campaign_id and i.kind='npc' and i.campaign_id=v_campaign_id)
 then raise exception 'NPC contact not shared with this character'; end if;
 update public.phone_calls pc set status='missed',ended_at=now()
 where pc.campaign_id=v_campaign_id and pc.status='ringing'
 and pc.created_at<now()-interval '45 seconds';
 insert into public.phone_calls(campaign_id,npc_identity_id,character_id,direction)
 values(v_campaign_id,p_npc_identity_id,p_character_id,'player') returning id into v_id;
 return v_id;
end;$$;
revoke all on function public.phone_player_start_call(uuid,uuid) from public,anon,authenticated;
grant execute on function public.phone_player_start_call(uuid,uuid) to authenticated;

-- Return shape changes require dropping the old RPCs first.
drop function if exists public.phone_gm_calls(uuid);
create function public.phone_gm_calls(p_campaign_id uuid)
returns table(id uuid,npc_identity_id uuid,character_id uuid,direction text,status text,created_at timestamptz,answered_at timestamptz,ended_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then raise exception 'Not authorized for campaign'; end if;
 update public.phone_calls pc set status='missed',ended_at=now()
 where pc.campaign_id=p_campaign_id and pc.status='ringing' and pc.created_at<now()-interval '45 seconds';
 return query select pc.id,pc.npc_identity_id,pc.character_id,pc.direction,pc.status,pc.created_at,pc.answered_at,pc.ended_at
 from public.phone_calls pc where pc.campaign_id=p_campaign_id order by pc.created_at desc limit 60;
end;$$;
revoke all on function public.phone_gm_calls(uuid) from public,anon,authenticated;
grant execute on function public.phone_gm_calls(uuid) to authenticated;

drop function if exists public.phone_player_current_call(uuid);
create function public.phone_player_current_call(p_character_id uuid)
returns table(id uuid,direction text,status text,caller_label text,created_at timestamptz,answered_at timestamptz,ended_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid()) then raise exception 'Not authorized for character'; end if;
 update public.phone_calls pc set status='missed',ended_at=now()
 where pc.character_id=p_character_id and pc.status='ringing' and pc.created_at<now()-interval '45 seconds';
 return query select pc.id,pc.direction,pc.status,
 (case when i.anonymous then 'Unknown Number' else i.display_name end)::text,
 pc.created_at,pc.answered_at,pc.ended_at
 from public.phone_calls pc join public.phone_identities i on i.id=pc.npc_identity_id
 where pc.character_id=p_character_id and pc.status in ('ringing','connected')
 order by pc.created_at desc limit 1;
end;$$;
revoke all on function public.phone_player_current_call(uuid) from public,anon,authenticated;
grant execute on function public.phone_player_current_call(uuid) to authenticated;

create or replace function public.phone_gm_answer_call(p_call_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 update public.phone_calls pc set status='connected',answered_at=now()
 where pc.id=p_call_id and pc.direction='player' and pc.status='ringing'
 and pc.created_at>=now()-interval '45 seconds'
 and exists(select 1 from public.campaigns c where c.id=pc.campaign_id and c.gm_id=auth.uid());
 if not found then raise exception 'Call unavailable or not authorized'; end if;
end;$$;
revoke all on function public.phone_gm_answer_call(uuid) from public,anon,authenticated;
grant execute on function public.phone_gm_answer_call(uuid) to authenticated;

-- The existing GM end-call RPC handles both directions; a declined player call
-- should be distinguished from a GM cancelling their own outgoing call.
create or replace function public.phone_gm_end_call(p_call_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 update public.phone_calls pc
 set status=case when pc.status='ringing' and pc.direction='player' then 'declined'
                 when pc.status='ringing' then 'cancelled' else 'ended' end,ended_at=now()
 where pc.id=p_call_id and pc.status in ('ringing','connected')
 and exists(select 1 from public.campaigns c where c.id=pc.campaign_id and c.gm_id=auth.uid());
 if not found then raise exception 'Call not found or not authorized'; end if;
end;$$;

-- Existing event trigger continues recording call state changes. Label direction.
create or replace function public.phone_log_call_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_label text; v_action text;
begin
 if tg_op='INSERT' then
   v_action:=case when new.direction='player' then 'Outgoing call' else 'Incoming call' end;
 elsif new.status is distinct from old.status then
   v_action:=case new.status
     when 'connected' then 'Answered'
     when 'declined' then 'Declined'
     when 'missed' then 'Missed'
     when 'cancelled' then 'Cancelled'
     when 'ended' then 'Ended'
     else null end;
 end if;
 if v_action is null then return new; end if;
 select case when i.anonymous then 'Unknown Number' else i.display_name end
 into v_label from public.phone_identities i where i.id=new.npc_identity_id;
 insert into public.campaign_events(campaign_id,character_id,audience,category,message)
 values(new.campaign_id,new.character_id,'character','system',
 'GHOST//LINK CALL: '||v_action||' — '||coalesce(v_label,'Unknown Number'));
 return new;
end;$$;

-- Players may answer GM-originated calls only; they may cancel their own
-- outgoing ringing calls, or end any connected call they participate in.
create or replace function public.phone_player_call_action(p_character_id uuid,p_call_id uuid,p_action text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 if not exists(select 1 from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid())
 then raise exception 'Not authorized for character'; end if;
 if p_action='answer' then
  update public.phone_calls pc set status='connected',answered_at=now()
  where pc.id=p_call_id and pc.character_id=p_character_id and pc.direction='gm'
  and pc.status='ringing' and pc.created_at>=now()-interval '45 seconds';
 elsif p_action='decline' then
  update public.phone_calls pc set status=case when pc.direction='player' then 'cancelled' else 'declined' end,ended_at=now()
  where pc.id=p_call_id and pc.character_id=p_character_id and pc.status='ringing';
 elsif p_action='end' then
  update public.phone_calls pc set status='ended',ended_at=now()
  where pc.id=p_call_id and pc.character_id=p_character_id and pc.status='connected';
 else raise exception 'Invalid call action';
 end if;
 if not found then raise exception 'Call already changed or no longer available'; end if;
end;$$;
