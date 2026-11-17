-- GM-only mapping from campaign player characters to Ghost//Link identities.
-- Run in Supabase SQL Editor before testing + New Chat.
create or replace function public.phone_gm_player_identities(p_campaign_id uuid)
returns table(identity_id uuid, character_id uuid, player_name text)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.campaigns c where c.id=p_campaign_id and c.gm_id=auth.uid()) then
    raise exception 'Not authorized for this campaign';
  end if;
  return query
  select i.id, ch.id, ch.name::text
  from public.characters ch
  join public.phone_identities i on i.character_id=ch.id and i.kind='player' and i.campaign_id=p_campaign_id
  where ch.campaign_id=p_campaign_id
  order by ch.name, ch.id;
end;
$$;
revoke all on function public.phone_gm_player_identities(uuid) from public, anon, authenticated;
grant execute on function public.phone_gm_player_identities(uuid) to authenticated;
