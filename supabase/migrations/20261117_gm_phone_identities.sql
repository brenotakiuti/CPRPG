-- GM Ghost//Link: list all NPC identities, including those with no conversations.
-- Run in the Supabase SQL Editor before deploying the frontend change.
-- Safe to rerun.
create or replace function public.phone_gm_identities(p_campaign_id uuid)
returns table (
  id uuid,
  internal_name text,
  display_name text,
  anonymous boolean
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.campaigns c
    where c.id = p_campaign_id and c.gm_id = auth.uid()
  ) then
    raise exception 'Not authorized for this campaign';
  end if;

  return query
  select pi.id, pi.internal_name, pi.display_name, pi.anonymous
  from public.phone_identities pi
  where pi.campaign_id = p_campaign_id and pi.kind = 'npc'
  order by pi.created_at, pi.id;
end;
$$;

revoke all on function public.phone_gm_identities(uuid) from public, anon, authenticated;
grant execute on function public.phone_gm_identities(uuid) to authenticated;
