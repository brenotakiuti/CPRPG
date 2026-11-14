-- Enable binary D2 (0 or 1) in the existing player dice logging RPC.
-- Apply this migration in Supabase SQL Editor before using D2.
create or replace function public.record_player_dice_roll(
  p_character_id uuid,
  p_campaign_id uuid,
  p_dice_sides integer,
  p_results integer[]
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_count integer;
  v_total integer;
  v_name text;
begin
  select c.name into v_name
  from public.characters c
  where c.id = p_character_id
    and c.campaign_id = p_campaign_id
    and c.player_id = auth.uid();
  if v_name is null then raise exception 'Character not owned by current player'; end if;
  v_count := coalesce(cardinality(p_results), 0);
  if v_count < 1 or v_count > 20 or p_dice_sides not in (2,6,8,10,12,20,100) then
    raise exception 'Invalid dice configuration';
  end if;
  if exists (select 1 from unnest(p_results) v where v is null or v < case when p_dice_sides = 2 then 0 else 1 end or v > case when p_dice_sides = 2 then 1 else p_dice_sides end) then
    raise exception 'Invalid die result';
  end if;
  select sum(v) into v_total from unnest(p_results) v;
  insert into public.campaign_events(campaign_id,character_id,audience,category,message)
  values(p_campaign_id,p_character_id,'character','system',
    v_name || ' ROLLED ' || v_count || 'D' || p_dice_sides || ' → ' ||
    array_to_string(p_results, ' + ') || ' = ' || v_total || ' [UNAPPROVED]')
  returning id into v_event_id;
  return v_event_id;
end;
$$;
revoke all on function public.record_player_dice_roll(uuid,uuid,integer,integer[]) from public;
revoke all on function public.record_player_dice_roll(uuid,uuid,integer,integer[]) from anon;
grant execute on function public.record_player_dice_roll(uuid,uuid,integer,integer[]) to authenticated;
