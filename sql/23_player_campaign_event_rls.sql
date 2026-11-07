-- 23 - Scope Player Campaign Event History to Assigned Campaign
-- Run in Supabase SQL Editor before enabling the player Logs overlay.
-- The previous player SELECT policy used c.campaign_id = c.campaign_id,
-- which does not restrict campaign-wide events to the player's campaign.
DROP POLICY IF EXISTS "Assigned players can read their own events" ON public.campaign_events;

CREATE POLICY "Assigned players can read their own events"
ON public.campaign_events
FOR SELECT
TO authenticated
USING (
  (
    audience = 'character'
    AND character_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.id = campaign_events.character_id
        AND c.campaign_id = campaign_events.campaign_id
        AND c.player_id = (SELECT auth.uid())
    )
  )
  OR
  (
    audience = 'campaign'
    AND EXISTS (
      SELECT 1 FROM public.characters AS c
      WHERE c.campaign_id = campaign_events.campaign_id
        AND c.player_id = (SELECT auth.uid())
    )
  )
);
