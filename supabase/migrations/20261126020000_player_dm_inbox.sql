-- Unified player DM inbox metadata, restricted to the authenticated character.
-- Private content remains accessible only to the two players via phone_player_dm_history.
create or replace function public.phone_player_dm_threads(p_character_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_campaign uuid; v_mode text;
begin
 select ch.campaign_id into v_campaign from public.characters ch where ch.id=p_character_id and ch.player_id=auth.uid();
 if v_campaign is null then raise exception 'Not authorized for character'; end if;
 select coalesce(s.mode,'disabled') into v_mode from public.campaigns c left join public.phone_player_dm_settings s on s.campaign_id=c.id where c.id=v_campaign;
 if v_mode='disabled' then return '[]'::jsonb; end if;
 return coalesce((
  select jsonb_agg(jsonb_build_object(
   'other_character_id',ch.id,'other_label',ch.name,
   'last_message',last_msg.body,'last_message_at',last_msg.created_at
  ) order by last_msg.created_at desc)
  from public.characters ch
  join lateral (
   select m.body,m.created_at from public.phone_player_dm_messages m
   where m.campaign_id=v_campaign and
   ((m.sender_character_id=p_character_id and m.recipient_character_id=ch.id)
    or (m.sender_character_id=ch.id and m.recipient_character_id=p_character_id))
   order by m.created_at desc,m.id desc limit 1
  ) last_msg on true
  where ch.campaign_id=v_campaign and ch.id<>p_character_id and ch.player_id is not null
 ),'[]'::jsonb);
end;$$;
revoke all on function public.phone_player_dm_threads(uuid) from public,anon,authenticated;
grant execute on function public.phone_player_dm_threads(uuid) to authenticated;
