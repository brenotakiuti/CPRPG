-- Shared NPC contacts reveal their public contact name/alias, not their real identity.
-- Unsolicited messages remain masked according to the identity's anonymous flag.
-- Existing anonymous identities named "Unknown Number" retain that label until updated.
create or replace function public.phone_player_shared_contacts(p_character_id uuid)
returns table(identity_id uuid,kind text,label text,anonymous boolean,
  can_message boolean,can_call boolean,has_conversation boolean)
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists(select 1 from public.characters ch where ch.id=p_character_id
    and ch.player_id=auth.uid()) then
    raise exception 'Not authorized for character';
  end if;
  return query
  select i.id, 'npc'::text,
    coalesce(nullif(btrim(i.display_name),''),'Unknown Number')::text,
    i.anonymous, true, true,
    exists(select 1 from public.phone_conversations pc
      join public.phone_identities self on self.id in (pc.identity_a,pc.identity_b)
        and self.kind='player' and self.character_id=p_character_id
      where i.id in (pc.identity_a,pc.identity_b))
  from public.phone_contact_grants g
  join public.phone_identities i on i.id=g.npc_identity_id and i.kind='npc'
  where g.character_id=p_character_id;
end;
$$;
revoke all on function public.phone_player_shared_contacts(uuid) from public,anon,authenticated;
grant execute on function public.phone_player_shared_contacts(uuid) to authenticated;
