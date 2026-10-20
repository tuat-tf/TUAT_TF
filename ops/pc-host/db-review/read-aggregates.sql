-- Synthetic-only acceptance of RLS-preserving read aggregates. Everything rolls back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF current_database()<>'tuat_rls_review' OR EXISTS(SELECT 1 FROM auth.users)
    OR current_setting('cron.launch_active_jobs')<>'off' THEN
    RAISE EXCEPTION 'Fresh empty isolated fixture required';
  END IF;
END $$;
\i /review/supabase/migrations/20261021010000_read_aggregates.sql
\i /review/supabase/migrations/20261021010000_read_aggregates.sql
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
INSERT INTO public.login_email_allowlist(email,created_by)
SELECT 'aggregate-'||n||'@example.invalid',('d6102101-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,42) n;
INSERT INTO auth.users(id,email)
SELECT ('d6102101-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'aggregate-'||n||'@example.invalid' FROM generate_series(1,42) n;
UPDATE public.profiles SET approved=true,status='active',
  blocks=CASE WHEN right(id::text,12)::bigint<=40 THEN ARRAY['middle_long'] ELSE ARRAY['short'] END
WHERE id::text LIKE 'd6102101-0000-4000-8000-%';
INSERT INTO public.practice_records(user_id,recorded_date,dist_low,dist_mid,dist_high,dist_speed,dist_actual,memo)
SELECT ('d6102101-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  '2026-10-01'::date+d,1,2,0,0,CASE WHEN n=1 AND d=0 THEN 1 ELSE 5 END,'synthetic'
FROM generate_series(1,41) n CROSS JOIN generate_series(0,30) d;
-- Out-of-period and wrong-block distances must not contribute.
INSERT INTO public.practice_records(user_id,recorded_date,dist_actual,memo) VALUES
('d6102101-0000-4000-8000-000000000001','2026-09-30',9000,'synthetic outside month');
INSERT INTO public.notes(id,author_id,scope,title,body,status,edit_policy) VALUES
('d6102101-0000-4000-8200-000000000001','d6102101-0000-4000-8000-000000000001','shared','Synthetic visible','','published','author'),
('d6102101-0000-4000-8200-000000000002','d6102101-0000-4000-8000-000000000001','personal','Synthetic hidden','','draft','author');
INSERT INTO public.note_articles(note_id,author_id,title,body)
SELECT 'd6102101-0000-4000-8200-000000000001','d6102101-0000-4000-8000-000000000001','Synthetic article '||n,'' FROM generate_series(1,1005) n;
INSERT INTO public.note_articles(note_id,author_id,title,body) VALUES
('d6102101-0000-4000-8200-000000000002','d6102101-0000-4000-8000-000000000001','Synthetic hidden article','');
INSERT INTO public.threads(id,folder_id,author_id,title) VALUES
('d6102101-0000-4000-8400-000000000001','d6102101-0000-4000-8200-000000000001','d6102101-0000-4000-8000-000000000001','Synthetic visible thread'),
('d6102101-0000-4000-8400-000000000002','d6102101-0000-4000-8200-000000000002','d6102101-0000-4000-8000-000000000001','Synthetic hidden thread');
INSERT INTO public.thread_posts(thread_id,author_id,body)
SELECT 'd6102101-0000-4000-8400-000000000001','d6102101-0000-4000-8000-000000000001','Synthetic post '||n FROM generate_series(1,1005) n;
INSERT INTO public.thread_posts(thread_id,author_id,body) VALUES
('d6102101-0000-4000-8400-000000000002','d6102101-0000-4000-8000-000000000001','Synthetic hidden post');
SELECT set_config('request.jwt.claim.sub','d6102101-0000-4000-8000-000000000042',true);
SELECT set_config('request.jwt.claims','{"sub":"d6102101-0000-4000-8000-000000000042","role":"authenticated","email":"aggregate-42@example.invalid"}',true);
SELECT set_config('request.headers','{}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE total numeric; visible bigint; hidden bigint; BEGIN
  SELECT count(*) INTO visible FROM public.get_monthly_distance_ranking('2026-10-01','2026-10-31');
  IF visible<>40 THEN RAISE EXCEPTION 'Wrong ranking population: %',visible; END IF;
  SELECT sum(total_km) INTO total FROM public.get_monthly_distance_ranking('2026-10-01','2026-10-31');
  IF total<>6198 THEN RAISE EXCEPTION 'Truncated/incorrect ranking: %',total; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.get_monthly_distance_ranking('2026-10-01','2026-10-31')
    WHERE id='d6102101-0000-4000-8000-000000000001' AND total_km=153 AND km_low=31 AND km_mid=62 AND km_other=60) THEN
    RAISE EXCEPTION 'Displayed distance/intensity rule changed';
  END IF;
  IF EXISTS(SELECT 1 FROM public.get_monthly_distance_ranking('2027-01-01','2027-01-31')) THEN
    RAISE EXCEPTION 'Empty month changed';
  END IF;
  SELECT count(*),max(article_count) INTO visible,hidden FROM public.get_note_content_counts(ARRAY[
    'd6102101-0000-4000-8200-000000000001','d6102101-0000-4000-8200-000000000002']::uuid[]);
  IF visible<>1 OR hidden<>1005 THEN RAISE EXCEPTION 'Counts leaked a hidden folder or truncated children'; END IF;
  SELECT count(*),max(post_count) INTO visible,hidden FROM public.get_thread_post_counts(ARRAY[
    'd6102101-0000-4000-8400-000000000001','d6102101-0000-4000-8400-000000000002']::uuid[]);
  IF visible<>1 OR hidden<>1005 THEN RAISE EXCEPTION 'Counts leaked a hidden thread or truncated posts'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
  IF has_function_privilege('anon','public.get_note_content_counts(uuid[])','EXECUTE')
    OR has_function_privilege('anon','public.get_thread_post_counts(uuid[])','EXECUTE')
    OR has_function_privilege('anon','public.get_monthly_distance_ranking(date,date)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc WHERE oid IN (
      'public.get_note_content_counts(uuid[])'::regprocedure,
      'public.get_thread_post_counts(uuid[])'::regprocedure,
      'public.get_monthly_distance_ranking(date,date)'::regprocedure) AND prosecdef) THEN
    RAISE EXCEPTION 'Aggregate authorization boundary changed';
  END IF;
END $$;
ROLLBACK;
SELECT 'PASS: read aggregates preserve RLS, full counts, month bounds and distance rules' AS result;
