-- Permit Dark, Light, and Full visibility modes in active combat sessions.
-- Preserve unrelated table constraints.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.combat_map_sessions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%visibility_mode%'
  LOOP
    EXECUTE format('ALTER TABLE public.combat_map_sessions DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.combat_map_sessions
  ADD CONSTRAINT combat_map_sessions_visibility_mode_check
  CHECK (visibility_mode IN ('dark', 'light', 'full'));
