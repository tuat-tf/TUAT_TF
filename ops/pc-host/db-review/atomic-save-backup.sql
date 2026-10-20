-- Fresh isolated runner only. Exercise the real RPCs/RLS/triggers; all rows roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF current_database()<>'tuat_rls_review'
    OR EXISTS(SELECT 1 FROM auth.users)
    OR EXISTS(SELECT 1 FROM public.profiles)
    OR current_setting('cron.launch_active_jobs')<>'off'
    OR public.backup_read_only() THEN
    RAISE EXCEPTION 'Fresh empty isolated primary fixture required';
  END IF;
END $$;

CREATE FUNCTION pg_temp.atomic_actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actor text:='d6102001-0000-4000-8000-'||lpad(n::text,12,'0');
BEGIN
  PERFORM set_config('request.jwt.claim.sub',actor,true);
  PERFORM set_config('request.jwt.claims',json_build_object(
    'sub',actor,'role','authenticated','email','atomic-'||n||'@example.invalid')::text,true);
  PERFORM set_config('request.headers','{}',true);
END $$;
CREATE FUNCTION pg_temp.expect_atomic_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE<>expected THEN RAISE; END IF;
    rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Expected SQLSTATE %',expected; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
INSERT INTO public.login_email_allowlist(email,created_by)
SELECT 'atomic-'||n||'@example.invalid',('d6102001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
FROM generate_series(1,4) n;
INSERT INTO auth.users(id,email)
SELECT ('d6102001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'atomic-'||n||'@example.invalid'
FROM generate_series(1,4) n;
UPDATE public.profiles SET approved=true,status='active'
WHERE id::text LIKE 'd6102001-0000-4000-8000-%';
INSERT INTO public.roles(id,name,can_manage_system)
VALUES('d6102001-0000-4000-8100-000000000001','Synthetic atomic system manager',true);
INSERT INTO public.profile_roles(profile_id,role_id)
VALUES('d6102001-0000-4000-8000-000000000004','d6102001-0000-4000-8100-000000000001');
-- The historical chain seeds a countdown. Restore it with this fixture's rollback.
UPDATE public.competitions SET is_countdown=false WHERE is_countdown;
INSERT INTO public.competitions(id,name,starts_on,is_countdown) VALUES
('atomic-old-20261020','Synthetic previous countdown','2099-01-01',true),
('atomic-new-20261020','Synthetic next countdown','2099-02-01',false);

SET LOCAL ROLE authenticated;
SELECT pg_temp.atomic_actor(1);
DO $$
DECLARE folder uuid:='d6102001-0000-4000-8200-000000000001';
  article uuid:='d6102001-0000-4000-8300-000000000001';
  first_option uuid:='d6102001-0000-4000-8400-000000000001';
  second_option uuid:='d6102001-0000-4000-8400-000000000002';
  editor uuid:='d6102001-0000-4000-8000-000000000002';
  result jsonb; original public.note_articles%ROWTYPE; folder_values jsonb;
BEGIN
  IF NOT public.login_access_allowed() THEN RAISE EXCEPTION 'Synthetic actor access denied'; END IF;
  folder_values:='{"scope":"shared","title":"Atomic folder","status":"published","edit_policy":"specified"}';
  result:=public.save_note_folder(folder,NULL,folder_values,ARRAY[editor]);
  IF result->>'id' IS DISTINCT FROM folder::text
    OR (SELECT count(*) FROM public.note_editors WHERE note_id=folder AND user_id=editor)<>1 THEN
    RAISE EXCEPTION 'Folder and editor did not commit together';
  END IF;
  PERFORM pg_temp.expect_atomic_error(format(
    'SELECT public.save_note_folder(%L,%L,%L,ARRAY[%L]::uuid[])',
    folder,'2000-01-01',folder_values||'{"title":"Rejected stale folder"}',editor),'40001');
  IF (SELECT title FROM public.notes WHERE id=folder)<>'Atomic folder' THEN
    RAISE EXCEPTION 'Stale folder update changed content';
  END IF;
  -- A failure after the folder insert must roll back that insert too.
  PERFORM pg_temp.expect_atomic_error(format(
    'SELECT public.save_note_folder(%L,NULL,%L,ARRAY[%L,%L]::uuid[])',
    'd6102001-0000-4000-8200-000000000002',folder_values,editor,editor),'23514');
  IF EXISTS(SELECT 1 FROM public.notes WHERE id='d6102001-0000-4000-8200-000000000002') THEN
    RAISE EXCEPTION 'Invalid editors left a partially saved folder';
  END IF;
  result:=public.save_note_article(article,folder,NULL,'{"title":"Atomic article","body":"Original"}',
    '{}','{}',jsonb_build_array(jsonb_build_object('id',first_option,'text','First'),
    jsonb_build_object('id',second_option,'text','Second')),true);
  IF result->>'id' IS DISTINCT FROM article::text
    OR (SELECT count(*) FROM public.note_poll_options WHERE article_id=article)<>2 THEN
    RAISE EXCEPTION 'Article and poll did not commit together';
  END IF;
  SELECT * INTO original FROM public.note_articles WHERE id=article;
  PERFORM pg_temp.expect_atomic_error(format(
    'SELECT public.save_note_article(%L,%L,%L,%L,ARRAY[%L,%L]::uuid[],ARRAY[%L,%L]::uuid[],%L,true)',
    article,folder,original.updated_at,'{"title":"Rejected article","body":"Partial"}',
    first_option,second_option,first_option,second_option,
    '[{"id":"d6102001-0000-4000-8400-000000000003","text":""}]'),'23514');
  IF (SELECT to_jsonb(a) FROM public.note_articles a WHERE id=article) IS DISTINCT FROM to_jsonb(original)
    OR (SELECT count(*) FROM public.note_poll_options WHERE article_id=article)<>2 THEN
    RAISE EXCEPTION 'Invalid poll left a partial article update';
  END IF;
END $$;

SELECT pg_temp.atomic_actor(2);
INSERT INTO public.note_poll_votes(option_id,user_id)
VALUES('d6102001-0000-4000-8400-000000000001','d6102001-0000-4000-8000-000000000002');
SELECT pg_temp.atomic_actor(1);
DO $$
DECLARE article public.note_articles%ROWTYPE; result jsonb;
BEGIN
  SELECT * INTO article FROM public.note_articles WHERE id='d6102001-0000-4000-8300-000000000001';
  PERFORM pg_temp.expect_atomic_error(format(
    'SELECT public.save_note_article(%L,%L,%L,%L,ARRAY[%L,%L]::uuid[],ARRAY[%L]::uuid[],%L,true)',
    article.id,article.note_id,article.updated_at,'{"title":"Cannot remove vote","body":"Changed"}',
    'd6102001-0000-4000-8400-000000000001','d6102001-0000-4000-8400-000000000002',
    'd6102001-0000-4000-8400-000000000002',
    '[{"id":"d6102001-0000-4000-8400-000000000003","text":"Third"}]'),'23514');
  IF (SELECT body FROM public.note_articles WHERE id=article.id)<>'Original' THEN
    RAISE EXCEPTION 'Rejected voted-option removal changed the article';
  END IF;
  result:=public.save_tweet('d6102001-0000-4000-8500-000000000001',
    '{"content":"Atomic tweet","poll_enabled":true}',ARRAY['First','Second'],
    ARRAY['d6102001-0000-4000-8000-000000000002']::uuid[],false,NULL);
  IF result->>'id'<>'d6102001-0000-4000-8500-000000000001'
    OR (SELECT count(*) FROM public.tweet_poll_options WHERE tweet_id='d6102001-0000-4000-8500-000000000001')<>2
    OR (SELECT count(*) FROM public.tweet_mentions WHERE tweet_id='d6102001-0000-4000-8500-000000000001')<>1 THEN
    RAISE EXCEPTION 'Tweet, poll, and mention did not commit together';
  END IF;
  PERFORM pg_temp.expect_atomic_error($query$SELECT public.save_tweet(
    'd6102001-0000-4000-8500-000000000002','{"content":"Partial tweet","poll_enabled":true}',
    ARRAY['Valid',''],ARRAY[]::uuid[],false,NULL)$query$,'23514');
  IF EXISTS(SELECT 1 FROM public.tweets WHERE id='d6102001-0000-4000-8500-000000000002') THEN
    RAISE EXCEPTION 'Invalid poll left a partial tweet';
  END IF;
  PERFORM pg_temp.expect_atomic_error($query$SELECT public.save_tweet(
    'd6102001-0000-4000-8500-000000000001','{"content":"Stale edit"}',
    ARRAY[]::text[],ARRAY[]::uuid[],true,'Old content')$query$,'40001');
END $$;
SELECT pg_temp.atomic_actor(3);
SELECT pg_temp.expect_atomic_error($query$SELECT public.save_tweet(
  'd6102001-0000-4000-8500-000000000001','{"content":"Other author edit"}',
  ARRAY[]::text[],ARRAY[]::uuid[],true,'Atomic tweet')$query$,'42501');
SELECT pg_temp.expect_atomic_error($query$SELECT public.save_note_article(
  'd6102001-0000-4000-8300-000000000002','d6102001-0000-4000-8200-000000000001',NULL,
  '{"title":"Unauthorized article"}','{}','{}','[]',false)$query$,'42501');
SELECT pg_temp.expect_atomic_error(
  $query$SELECT public.set_competition_countdown('atomic-new-20261020','atomic-old-20261020')$query$,'42501');
SELECT pg_temp.atomic_actor(4);
SELECT public.set_competition_countdown('atomic-new-20261020','atomic-old-20261020');
SELECT pg_temp.expect_atomic_error(
  $query$SELECT public.set_competition_countdown('atomic-old-20261020','atomic-old-20261020')$query$,'40001');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.competitions WHERE is_countdown)<>1
    OR NOT (SELECT is_countdown FROM public.competitions WHERE id='atomic-new-20261020')
    OR (SELECT count(*) FROM public.note_poll_votes WHERE option_id='d6102001-0000-4000-8400-000000000001')<>1
    OR EXISTS(SELECT 1 FROM public.tweets WHERE id='d6102001-0000-4000-8500-000000000002')
    OR EXISTS(SELECT 1 FROM public.notes WHERE id='d6102001-0000-4000-8200-000000000002') THEN
    RAISE EXCEPTION 'Owner verification found partial or unauthorized changes';
  END IF;
END $$;

-- New invoker RPCs must remain covered by the existing table-level backup guard.
CREATE TEMP TABLE atomic_before_backup AS
SELECT name,pg_catalog.md5(rows::text) AS digest FROM (
  SELECT 'notes' name,coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) rows FROM public.notes r
  UNION ALL SELECT 'articles',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.note_articles r
  UNION ALL SELECT 'tweets',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.tweets r
  UNION ALL SELECT 'competitions',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.competitions r
) snapshots;
UPDATE pc_ops.backup_policy SET read_only=true WHERE singleton;
SET LOCAL ROLE authenticated;
SELECT pg_temp.atomic_actor(1);
SELECT pg_temp.expect_atomic_error($query$SELECT public.save_note_folder(
  'd6102001-0000-4000-8200-000000000003',NULL,
  '{"scope":"personal","title":"Backup folder","status":"draft","edit_policy":"author"}','{}')$query$,'55000');
SELECT pg_temp.expect_atomic_error($query$SELECT public.save_note_article(
  'd6102001-0000-4000-8300-000000000002','d6102001-0000-4000-8200-000000000001',NULL,
  '{"title":"Backup article"}','{}','{}','[]',false)$query$,'55000');
SELECT pg_temp.expect_atomic_error($query$SELECT public.save_tweet(
  'd6102001-0000-4000-8500-000000000003','{"content":"Backup tweet"}',
  ARRAY[]::text[],ARRAY[]::uuid[],false,NULL)$query$,'55000');
SELECT pg_temp.atomic_actor(4);
SELECT pg_temp.expect_atomic_error(
  $query$SELECT public.set_competition_countdown('atomic-old-20261020','atomic-new-20261020')$query$,'55000');
SELECT pg_temp.expect_atomic_error('SELECT public.assert_primary_writable()','55000');
RESET ROLE;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM atomic_before_backup b JOIN (
    SELECT 'notes' name,coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) rows FROM public.notes r
    UNION ALL SELECT 'articles',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.note_articles r
    UNION ALL SELECT 'tweets',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.tweets r
    UNION ALL SELECT 'competitions',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.id),'[]'::jsonb) FROM public.competitions r
  ) after_state USING(name) WHERE b.digest IS DISTINCT FROM md5(after_state.rows::text)) THEN
    RAISE EXCEPTION 'Read-only backup RPC changed application content';
  END IF;
END $$;
SELECT 'PASS: atomic saves, partial failure rollback, conflicts, author permissions, and backup write rejection';
ROLLBACK;
