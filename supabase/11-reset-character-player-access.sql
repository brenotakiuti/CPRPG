-- 11 - Reset Character Player Access
-- Run once in Supabase SQL Editor BEFORE merging the frontend pull request.
-- Only the campaign GM may revoke a claimed character's access.
-- Returns a fresh one-time invitation token in the same transaction.
create or replace function public.reset_character_player_access(p_character_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Lock the character and verify GM ownership before changing anything.
  perform 1
  from public.characters c
  join public.campaigns camp on camp.id = c.campaign_id
  where c.id = p_character_id
    and camp.gm_id = auth.uid()
    and c.player_id is not null
  for update of c;

  if not found then
    raise exception 'Character is unassigned or you are not its GM';
  end if;

  -- Existing player loses access; all other character data is preserved.
  update public.characters
  set player_id = null
  where id = p_character_id;

  -- Invalidate any previously outstanding invitation for this character.
  delete from public.character_invitations
  where character_id = p_character_id;

  insert into public.character_invitations(character_id)
  values (p_character_id)
  returning token into v_token;

  return v_token;
end;
$$;

revoke all on function public.reset_character_player_access(uuid)
from public, anon, authenticated;
grant execute on function public.reset_character_player_access(uuid)
to authenticated;
