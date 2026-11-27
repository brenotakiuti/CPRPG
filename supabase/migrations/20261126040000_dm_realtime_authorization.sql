-- Fix private Ghost//Link Realtime Broadcast authorization.
-- Run after 20261126030000_dm_realtime.sql.
-- SECURITY DEFINER allows checking ownership without exposing the underlying
-- character, campaign, or DM settings tables to the Realtime subscriber.
BEGIN;

CREATE OR REPLACE FUNCTION public.ghost_dm_can_subscribe(p_topic text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_prefix text;
    v_id text;
    v_user uuid;
BEGIN
    v_user := auth.uid();

    IF v_user IS NULL OR p_topic IS NULL THEN
        RETURN false;
    END IF;

    v_prefix := split_part(p_topic, ':', 1);
    v_id := split_part(p_topic, ':', 2);

    -- Only exactly two components, with a valid UUID.
    IF p_topic <> v_prefix || ':' || v_id
       OR v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
        RETURN false;
    END IF;

    IF v_prefix = 'ghost-dm' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.characters c
            WHERE c.id = v_id::uuid
              AND c.player_id = v_user
        );
    END IF;

    IF v_prefix = 'ghost-dm-monitor' THEN
        RETURN EXISTS (
            SELECT 1
            FROM public.campaigns c
            JOIN public.phone_player_dm_settings s ON s.campaign_id = c.id
            WHERE c.id = v_id::uuid
              AND c.gm_id = v_user
              AND s.mode = 'monitored'
        );
    END IF;

    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.ghost_dm_can_subscribe(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ghost_dm_can_subscribe(text)
TO authenticated;

DROP POLICY IF EXISTS ghost_dm_private_topic_read ON realtime.messages;

CREATE POLICY ghost_dm_private_topic_read
ON realtime.messages
FOR SELECT
TO authenticated
USING (public.ghost_dm_can_subscribe(realtime.topic()));

COMMIT;
