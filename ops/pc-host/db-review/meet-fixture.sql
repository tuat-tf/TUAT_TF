-- Included inside the caller's transaction, before existing meet acceptance SQL.
DO $$ BEGIN
  IF current_database()<>'tuat_rls_review'
    OR EXISTS(SELECT 1 FROM auth.users)
    OR EXISTS(SELECT 1 FROM public.profiles)
    OR current_setting('cron.launch_active_jobs')<>'off' THEN
    RAISE EXCEPTION 'Fresh empty isolated meet fixture required';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
INSERT INTO public.login_email_allowlist(email,created_by)
SELECT 'integrated-meet-'||n||'@example.invalid',
  ('d6102002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,3) n;
INSERT INTO auth.users(id,email)
SELECT ('d6102002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'integrated-meet-'||n||'@example.invalid' FROM generate_series(1,3) n;
UPDATE public.profiles SET approved=true,status='active'
WHERE id::text LIKE 'd6102002-0000-4000-8000-%';
INSERT INTO public.roles(id,name,can_manage_system,can_manage_members)
VALUES('d6102002-0000-4000-8100-000000000001','Synthetic integration system manager',true,true);
INSERT INTO public.profile_roles(profile_id,role_id)
VALUES('d6102002-0000-4000-8000-000000000003','d6102002-0000-4000-8100-000000000001');
SELECT set_config('request.headers','{}',true);
