-- Apply after the simulated calls and campaign_events audience migrations.
-- Safe to rerun. Logs are personal to the recipient, and never enter HUD.
create or replace function public.phone_log_call_event()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_label text; v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'Incoming call';
  elsif new.status is distinct from old.status then
    v_action := case new.status
      when 'connected' then 'Answered'
      when 'declined' then 'Declined'
      when 'missed' then 'Missed'
      when 'cancelled' then 'Cancelled by caller'
      when 'ended' then 'Ended'
      else null end;
  end if;
  if v_action is null then return new; end if;
  select case when i.anonymous then 'Unknown Number' else i.display_name end
    into v_label from public.phone_identities i where i.id=new.npc_identity_id;
  insert into public.campaign_events(campaign_id,character_id,audience,category,message)
  values(new.campaign_id,new.character_id,'character','system',
    'GHOST//LINK CALL: ' || v_action || ' — ' || coalesce(v_label,'Unknown Number'));
  return new;
end;
$$;
drop trigger if exists phone_log_call_event_trigger on public.phone_calls;
create trigger phone_log_call_event_trigger
after insert or update of status on public.phone_calls
for each row execute function public.phone_log_call_event();
revoke all on function public.phone_log_call_event() from public,anon,authenticated;
