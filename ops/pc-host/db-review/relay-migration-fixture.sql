-- The published relay migration expects the one-off OB import to be activated.
-- Reproduce that data prerequisite in this new empty fixture, never by reading production.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'tuat_rls_review' OR EXISTS(SELECT 1 FROM auth.users)
    OR EXISTS(SELECT 1 FROM public.profiles)
    OR current_setting('cron.launch_active_jobs')<>'off'
    OR EXISTS(SELECT 1 FROM public.competition_participants) THEN
    RAISE EXCEPTION 'Fresh synthetic relay migration prerequisite required';
  END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
INSERT INTO public.competitions(id,name,starts_on)
VALUES('3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5','Synthetic activated OB migration prerequisite','2099-01-01')
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.competition_meets(competition_id,meet_key,legacy_source,ready)
VALUES('3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5','ob-2026','ob-2026',true)
ON CONFLICT(competition_id) DO UPDATE SET ready=true;
COMMIT;
