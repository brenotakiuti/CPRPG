-- Apply after the previously reviewed migration adding
-- campaigns.starting_attribute_points and campaigns.starting_money.
-- Exposes ONLY those two values to a player holding an enabled creation token.
-- Does not modify existing character-creation logic.
CREATE OR REPLACE FUNCTION public.get_character_creation_rules(p_token uuid)
RETURNS TABLE(starting_attribute_points integer, starting_money bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT c.starting_attribute_points, c.starting_money
  FROM public.campaigns c
  WHERE c.character_creation_token = p_token
    AND c.character_creation_enabled = true;
$function$;

REVOKE ALL ON FUNCTION public.get_character_creation_rules(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_character_creation_rules(uuid) TO authenticated;
