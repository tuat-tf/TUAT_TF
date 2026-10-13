-- Isolated synthetic DB only. Initial migration, subsequent edits, and retries all roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
  IF current_database() NOT IN ('tuat_role_review','tuat_rls_review','tuat_role_permissions_20261013')
    OR EXISTS(SELECT 1 FROM auth.users WHERE email IS NULL OR email !~ '@example\.invalid$')
    OR EXISTS(SELECT 1 FROM public.profiles WHERE email IS NULL OR email !~ '@example\.invalid$') THEN
    RAISE EXCEPTION 'Use the isolated synthetic role review database';
  END IF;
END $$;

CREATE FUNCTION pg_temp.expect_capability_rejection(statement text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE rejected boolean:=false;
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege OR check_violation OR raise_exception THEN rejected:=true;
  END;
  IF NOT rejected THEN RAISE EXCEPTION 'Synthetic operation must be denied'; END IF;
END $$;

CREATE FUNCTION pg_temp.use_capability_actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub','a6101312-0000-4000-8000-'||lpad(n::text,12,'0'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('role','authenticated','email','capability-'||n||'@example.invalid')::text,true);
END $$;

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
SELECT set_config('test.capabilities_initial', (NOT EXISTS(
  SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='roles' AND column_name='can_moderate_comments'
))::text,true);
INSERT INTO auth.users(id,email)
SELECT ('a6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'capability-'||n||'@example.invalid' FROM generate_series(1,8) n;
INSERT INTO public.login_email_allowlist(email,created_by)
SELECT 'capability-'||n||'@example.invalid',('a6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n;
INSERT INTO public.profiles(id,email,display_name,approved,status)
SELECT ('a6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'capability-'||n||'@example.invalid','合成権限検証',true,'active' FROM generate_series(1,8) n
ON CONFLICT(id) DO UPDATE SET approved=true,status='active';
INSERT INTO public.roles(id,name,can_create_menu,can_manage_members,can_manage_system) VALUES
 ('a6101312-0000-4000-8100-000000000001','管理者',false,false,false),
 ('a6101312-0000-4000-8100-000000000002','OB戦2026',false,false,false),
 ('a6101312-0000-4000-8100-000000000003','合成大会の既存担当',false,false,false),
 ('a6101312-0000-4000-8100-000000000004','短距離ブロック長',false,false,false),
 ('a6101312-0000-4000-8100-000000000005','合成メニュー作成',true,false,false),
 ('a6101312-0000-4000-8100-000000000006','長距離ブロック長',true,false,false),
 ('a6101312-0000-4000-8100-000000000007','合成システムと部員管理',false,true,true);
INSERT INTO public.profile_roles(profile_id,role_id)
SELECT ('a6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('a6101312-0000-4000-8100-'||lpad(n::text,12,'0'))::uuid FROM unnest(ARRAY[1,2,3,4,6,7]) n;
INSERT INTO public.profile_roles(profile_id,role_id) VALUES
 ('a6101312-0000-4000-8000-000000000004','a6101312-0000-4000-8100-000000000005');
INSERT INTO public.competitions(id,name,starts_on) VALUES
 ('codex-capability-ob-20261013','合成OB権限検証','2099-01-01'),
 ('codex-capability-generic-20261013','合成一般大会権限検証','2099-01-01');
INSERT INTO public.competition_meets(competition_id,meet_key,staff_role_id,legacy_source,ready) VALUES
 ('codex-capability-ob-20261013','codex-capability-ob-20261013','a6101312-0000-4000-8100-000000000003','ob-2026',true),
 ('codex-capability-generic-20261013','codex-capability-generic-20261013','a6101312-0000-4000-8100-000000000003',NULL,true);
SELECT set_config('test.capability_old_roles',(SELECT md5(jsonb_agg(to_jsonb(r)-'can_moderate_comments'-'can_manage_ob_meet'-'editable_menu_blocks' ORDER BY r.id)::text) FROM public.roles r),true);
SELECT set_config('test.capability_assignments',(SELECT md5(coalesce(jsonb_agg(to_jsonb(pr) ORDER BY profile_id,role_id),'[]')::text) FROM public.profile_roles pr),true);
SELECT set_config('test.capability_meets',(SELECT md5(jsonb_agg(to_jsonb(m) ORDER BY competition_id)::text) FROM public.competition_meets m),true);
SELECT set_config('request.headers','{}',true);
\ir ../migrations/20261013120000_configured_role_capabilities.sql

DO $$ BEGIN
  IF current_setting('test.capability_old_roles') IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(r)-'can_moderate_comments'-'can_manage_ob_meet'-'editable_menu_blocks' ORDER BY r.id)::text) FROM public.roles r)
    OR current_setting('test.capability_assignments') IS DISTINCT FROM (SELECT md5(coalesce(jsonb_agg(to_jsonb(pr) ORDER BY profile_id,role_id),'[]')::text) FROM public.profile_roles pr)
    OR current_setting('test.capability_meets') IS DISTINCT FROM (SELECT md5(jsonb_agg(to_jsonb(m) ORDER BY competition_id)::text) FROM public.competition_meets m) THEN
    RAISE EXCEPTION 'Migration changed existing role attributes, assignments, or meet settings';
  END IF;
  IF current_setting('test.capabilities_initial')::boolean THEN
    IF NOT (SELECT can_moderate_comments FROM public.roles WHERE id='a6101312-0000-4000-8100-000000000001')
      OR NOT (SELECT can_manage_ob_meet FROM public.roles WHERE id='a6101312-0000-4000-8100-000000000002')
      OR NOT (SELECT can_manage_ob_meet FROM public.roles WHERE id='a6101312-0000-4000-8100-000000000003')
      OR (SELECT editable_menu_blocks FROM public.roles WHERE id='a6101312-0000-4000-8100-000000000004') IS DISTINCT FROM ARRAY['short']
      OR (SELECT editable_menu_blocks FROM public.roles WHERE id='a6101312-0000-4000-8100-000000000006') IS DISTINCT FROM ARRAY['middle_long'] THEN
      RAISE EXCEPTION 'Initial legacy capabilities were not preserved';
    END IF;
  ELSE
    -- Reruns against an already migrated schema use explicit fixture settings.
    UPDATE public.roles SET can_moderate_comments=true WHERE id='a6101312-0000-4000-8100-000000000001';
    UPDATE public.roles SET can_manage_ob_meet=true WHERE id IN ('a6101312-0000-4000-8100-000000000002','a6101312-0000-4000-8100-000000000003');
    UPDATE public.roles SET editable_menu_blocks=ARRAY['short'] WHERE id='a6101312-0000-4000-8100-000000000004';
    UPDATE public.roles SET editable_menu_blocks=ARRAY['middle_long'] WHERE id='a6101312-0000-4000-8100-000000000006';
  END IF;
END $$;

-- Display-name changes keep granted settings. Matching names on new roles grant nothing.
UPDATE public.roles SET name='合成コメント担当' WHERE id='a6101312-0000-4000-8100-000000000001';
UPDATE public.roles SET name='合成OB担当' WHERE id='a6101312-0000-4000-8100-000000000002';
UPDATE public.roles SET name='合成短距離担当' WHERE id='a6101312-0000-4000-8100-000000000004';
INSERT INTO public.roles(id,name,can_create_menu) VALUES
 ('a6101312-0000-4000-8100-000000000008','管理者',false),
 ('a6101312-0000-4000-8100-000000000009','OB戦2026',false),
 ('a6101312-0000-4000-8100-000000000010','短距離ブロック長',true);
INSERT INTO public.profile_roles(profile_id,role_id)
SELECT 'a6101312-0000-4000-8000-000000000008',id FROM public.roles
WHERE id IN ('a6101312-0000-4000-8100-000000000008','a6101312-0000-4000-8100-000000000009','a6101312-0000-4000-8100-000000000010');
UPDATE public.roles SET can_moderate_comments=false WHERE id='a6101312-0000-4000-8100-000000000001';
UPDATE public.roles SET can_manage_ob_meet=false WHERE id='a6101312-0000-4000-8100-000000000002';
UPDATE public.roles SET editable_menu_blocks='{}' WHERE id='a6101312-0000-4000-8100-000000000004';
\ir ../migrations/20261013120000_configured_role_capabilities.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.roles WHERE id IN ('a6101312-0000-4000-8100-000000000001','a6101312-0000-4000-8100-000000000002','a6101312-0000-4000-8100-000000000004','a6101312-0000-4000-8100-000000000008','a6101312-0000-4000-8100-000000000009','a6101312-0000-4000-8100-000000000010')
   AND (can_moderate_comments OR can_manage_ob_meet OR cardinality(editable_menu_blocks)>0)) THEN
   RAISE EXCEPTION 'Retry or matching label restored revoked capabilities';
 END IF;
END $$;
UPDATE public.roles SET can_moderate_comments=true WHERE id='a6101312-0000-4000-8100-000000000001';
UPDATE public.roles SET can_manage_ob_meet=true WHERE id='a6101312-0000-4000-8100-000000000002';
UPDATE public.roles SET editable_menu_blocks=ARRAY['short'] WHERE id='a6101312-0000-4000-8100-000000000004';

-- Everyone and invalid scopes are rejected even for mirror/service writes.
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET can_manage_system=true WHERE is_everyone');
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET can_manage_members=true WHERE is_everyone');
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET can_moderate_comments=true WHERE is_everyone');
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET can_manage_ob_meet=true WHERE is_everyone');
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET editable_menu_blocks=ARRAY[''short''] WHERE is_everyone');
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET editable_menu_blocks=ARRAY[''jump''] WHERE id=''a6101312-0000-4000-8100-000000000004''');
SELECT pg_temp.expect_capability_rejection('UPDATE public.roles SET editable_menu_blocks=ARRAY[NULL::text] WHERE id=''a6101312-0000-4000-8100-000000000004''');
SELECT set_config('request.headers','{}',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE rights jsonb; BEGIN
  PERFORM pg_temp.use_capability_actor(1);
  IF NOT public.can_moderate_comments() OR public.can_manage_ob_meet() THEN RAISE EXCEPTION 'Comment capability independence failed'; END IF;
  PERFORM pg_temp.use_capability_actor(2);
  rights:=public.competition_meet_permissions('codex-capability-ob-20261013');
  IF NOT public.can_manage_ob_meet() OR rights->>'manage'<>'true' OR rights->>'record'<>'true' OR rights->>'register'<>'true' OR rights->>'history'<>'true' OR rights->>'configure'<>'false' THEN RAISE EXCEPTION 'OB capability does not control primary permissions'; END IF;
  PERFORM pg_temp.use_capability_actor(3);
  IF NOT public.can_manage_ob_meet() OR public.competition_meet_permissions('codex-capability-generic-20261013')->>'manage'<>'true' THEN RAISE EXCEPTION 'Existing staff assignment lost access'; END IF;
  PERFORM pg_temp.use_capability_actor(4);
  IF NOT public.can_edit_block_menu('short') OR NOT public.can_edit_block_menu('jump') OR NOT public.can_edit_block_menu('throw') OR public.can_edit_block_menu('middle_long') OR public.can_edit_block_menu(NULL) THEN RAISE EXCEPTION 'Separate creation role or short legacy scopes failed'; END IF;
  PERFORM pg_temp.use_capability_actor(6);
  IF NOT public.can_edit_block_menu('middle_long') OR public.can_edit_block_menu('short') THEN RAISE EXCEPTION 'Long scope failed'; END IF;
  PERFORM pg_temp.use_capability_actor(7);
  rights:=public.competition_meet_permissions('codex-capability-ob-20261013');
  IF rights->>'manage'<>'false' OR rights->>'record'<>'false' OR rights->>'register'<>'false' OR rights->>'history'<>'false' OR rights->>'configure'<>'true' THEN RAISE EXCEPTION 'System-only OB boundary changed'; END IF;
  PERFORM pg_temp.use_capability_actor(8);
  IF public.can_moderate_comments() OR public.can_manage_ob_meet() OR public.can_edit_block_menu('short') THEN RAISE EXCEPTION 'Matching names granted capabilities'; END IF;
END $$;
RESET ROLE;

-- Revoking the primary OB capability denies writes atomically, including self-service.
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE public.roles SET can_manage_ob_meet=false WHERE id='a6101312-0000-4000-8100-000000000003';
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT pg_temp.use_capability_actor(3);
SET LOCAL ROLE authenticated;
DO $$ DECLARE rights jsonb; BEGIN
 rights:=public.competition_meet_permissions('codex-capability-ob-20261013');
 IF rights->>'manage'<>'false' OR rights->>'record'<>'false' OR rights->>'register'<>'false' OR rights->>'history'<>'false' THEN RAISE EXCEPTION 'Revoked OB capability still allows primary access'; END IF;
 IF public.competition_meet_permissions('codex-capability-generic-20261013')->>'manage'<>'true' THEN RAISE EXCEPTION 'Generic staff role scope changed'; END IF;
 PERFORM pg_temp.expect_capability_rejection($sql$SELECT public.mutate_competition_meet('codex-capability-ob-20261013','a6101312-0000-4000-8600-000000000001','{"action":"participant.save","name":"合成拒否","grade":"B1"}')$sql$);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.competition_participants WHERE competition_id='codex-capability-ob-20261013')
   OR EXISTS(SELECT 1 FROM public.competition_meet_requests WHERE competition_id='codex-capability-ob-20261013') THEN RAISE EXCEPTION 'Rejected mutation left partial writes'; END IF;
END $$;
-- Everyone still combines the original six flags, while anonymous callers get no capability.
UPDATE public.roles SET can_create_menu=true,can_decide_practice=true WHERE is_everyone;
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT pg_temp.use_capability_actor(5);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF NOT public.can_create_menu() OR NOT public.can_decide_practice() OR public.can_moderate_comments() OR public.can_manage_ob_meet() OR public.can_edit_block_menu('short') THEN RAISE EXCEPTION 'Everyone capability boundary changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 IF public.can_create_menu() OR public.can_decide_practice() OR public.can_moderate_comments() OR public.can_manage_ob_meet() OR public.can_edit_block_menu('short') THEN RAISE EXCEPTION 'Anonymous capability granted'; END IF;
END $$;
RESET ROLE;
SELECT 'Configured role capabilities, one-time backfill, rename, OR scopes, everyone, OB primary denial and generic meet scope passed' AS result;
ROLLBACK;
