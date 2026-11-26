-- Secure, payload-free DM notifications. Realtime authorization is checked against
-- the current authenticated user, not a client-supplied character/campaign claim.
-- Apply this migration in Supabase before deploying the realtime client changes.
create index if not exists phone_player_dm_pair_cursor_idx
 on public.phone_player_dm_messages(campaign_id,created_at,id);

create or replace function public.phone_player_dm_since(
 p_character_id uuid,p_other_character_id uuid,p_after timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign uuid;v_mode text;
begin
 select campaign_id into v_campaign from public.characters where id=p_character_id and player_id=auth.uid();
 if v_campaign is null then raise exception 'Not authorized for character'; end if;
 select coalesce(s.mode,'disabled') into v_mode from public.campaigns c left join public.phone_player_dm_settings s on s.campaign_id=c.id where c.id=v_campaign;
 if v_mode='disabled' then raise exception 'Player messaging is disabled'; end if;
 if not exists(select 1 from public.characters where id=p_other_character_id and campaign_id=v_campaign and player_id is not null)
 then raise exception 'Invalid recipient'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'sender_id',m.sender_character_id,'body',m.body,'created_at',m.created_at) order by m.created_at,m.id)
 from (select id,sender_character_id,body,created_at from public.phone_player_dm_messages
 where campaign_id=v_campaign and ((sender_character_id=p_character_id and recipient_character_id=p_other_character_id)
 or (sender_character_id=p_other_character_id and recipient_character_id=p_character_id))
 and (p_after is null or (created_at,id)>(p_after,coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid)))
 order by created_at,id limit 200) m),'[]'::jsonb);
end;$$;
revoke all on function public.phone_player_dm_since(uuid,uuid,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.phone_player_dm_since(uuid,uuid,timestamptz,uuid) to authenticated;

-- Broadcast only identifiers. Message bodies are always fetched through
-- permission-checked RPCs. Private topics cannot be joined by other players.
create policy "ghost_dm_private_topic_read" on realtime.messages for select to authenticated
using (
 (split_part(realtime.topic(),':',1)='ghost-dm'
  and exists(select 1 from public.characters c where c.id::text=split_part(realtime.topic(),':',2) and c.player_id=auth.uid()))
 or
 (split_part(realtime.topic(),':',1)='ghost-dm-monitor'
  and exists(select 1 from public.campaigns c join public.phone_player_dm_settings s on s.campaign_id=c.id
   where c.id::text=split_part(realtime.topic(),':',2) and c.gm_id=auth.uid() and s.mode='monitored'))
);
create or replace function public.phone_player_dm_notify()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 perform realtime.send(jsonb_build_object('id',new.id,'sender',new.sender_character_id,'recipient',new.recipient_character_id),
  'new-message','ghost-dm:'||new.sender_character_id::text,true);
 perform realtime.send(jsonb_build_object('id',new.id,'sender',new.sender_character_id,'recipient',new.recipient_character_id),
  'new-message','ghost-dm:'||new.recipient_character_id::text,true);
 if exists(select 1 from public.phone_player_dm_settings where campaign_id=new.campaign_id and mode='monitored') then
  perform realtime.send(jsonb_build_object('id',new.id),'new-message','ghost-dm-monitor:'||new.campaign_id::text,true);
 end if;
 return new;
end;$$;
drop trigger if exists phone_player_dm_notify_insert on public.phone_player_dm_messages;
create trigger phone_player_dm_notify_insert after insert on public.phone_player_dm_messages
for each row execute function public.phone_player_dm_notify();
