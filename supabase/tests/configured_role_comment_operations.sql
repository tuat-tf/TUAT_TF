-- Real RLS/RPC operations on isolated synthetic rows only; never commit this script.
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
CREATE FUNCTION pg_temp.use_comment_capability_actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub','b6101312-0000-4000-8000-'||lpad(n::text,12,'0'),true);
 PERFORM set_config('request.jwt.claims',json_build_object('role','authenticated','email','comment-capability-'||n||'@example.invalid')::text,true);
END $$;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
UPDATE public.roles SET can_create_menu=false,can_create_schedule=false,can_create_notice=false,can_decide_practice=false WHERE is_everyone;
INSERT INTO auth.users(id,email)
SELECT ('b6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'comment-capability-'||n||'@example.invalid' FROM generate_series(1,5) n;
INSERT INTO public.login_email_allowlist(email,created_by)
SELECT 'comment-capability-'||n||'@example.invalid',('b6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,5) n;
INSERT INTO public.profiles(id,email,display_name,approved,status,sheet_name)
SELECT ('b6101312-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'comment-capability-'||n||'@example.invalid',
 '合成コメント権限',true,'active',CASE WHEN n=2 THEN '合成コメント権限シート' ELSE NULL END FROM generate_series(1,5) n
ON CONFLICT(id) DO UPDATE SET approved=true,status='active',sheet_name=excluded.sheet_name;
INSERT INTO public.roles(id,name,can_manage_system,can_manage_members,can_create_schedule,can_create_menu,can_create_notice,can_decide_practice,can_moderate_comments,can_manage_ob_meet)
SELECT ('b6101312-0000-4000-8100-'||lpad(n::text,12,'0'))::uuid,'合成個別権限'||n,n=1,n=2,n=3,n=4,n=5,n=6,n=7,n=8 FROM generate_series(1,8) n;
INSERT INTO public.roles(id,name) VALUES('b6101312-0000-4000-8100-000000000009','管理者');
INSERT INTO public.profile_roles(profile_id,role_id) VALUES
 ('b6101312-0000-4000-8000-000000000001','b6101312-0000-4000-8100-000000000007'),
 ('b6101312-0000-4000-8000-000000000003','b6101312-0000-4000-8100-000000000009');
INSERT INTO public.profile_roles(profile_id,role_id)
SELECT 'b6101312-0000-4000-8000-000000000004',('b6101312-0000-4000-8100-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n;
INSERT INTO public.practice_records(id,user_id,recorded_date)
VALUES('b6101312-0000-4000-8200-000000000001','b6101312-0000-4000-8000-000000000002','2099-01-01');
INSERT INTO public.comments(id,user_id,target_type,target_id,content) VALUES
 ('b6101312-0000-4000-8300-000000000001','b6101312-0000-4000-8000-000000000002','record','b6101312-0000-4000-8200-000000000001','合成他人RPC削除'),
 ('b6101312-0000-4000-8300-000000000002','b6101312-0000-4000-8000-000000000002','record','b6101312-0000-4000-8200-000000000001','合成他人RLS削除'),
 ('b6101312-0000-4000-8300-000000000003','b6101312-0000-4000-8000-000000000003','record','b6101312-0000-4000-8200-000000000001','合成本人コメント');
INSERT INTO public.sheet_record_replies(id,record_id,owner_id,recorded_date,reply_index,content) VALUES
 ('b6101312-0000-4000-8400-000000000001','b6101312-0000-4000-8200-000000000001','b6101312-0000-4000-8000-000000000002','2099-01-01',0,'合成シート返信');
SELECT set_config('request.headers','{}',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 PERFORM pg_temp.use_comment_capability_actor(4);
 IF NOT public.can_manage_system() OR NOT public.can_manage_members() OR NOT public.can_create_schedule()
   OR NOT public.can_create_menu() OR NOT public.can_create_notice() OR NOT public.can_decide_practice()
   OR NOT public.can_moderate_comments() OR NOT public.can_manage_ob_meet() THEN
   RAISE EXCEPTION 'Eight independent role capabilities did not combine with OR';
 END IF;
 PERFORM pg_temp.use_comment_capability_actor(5);
 IF public.can_manage_system() OR public.can_manage_members() OR public.can_create_schedule()
   OR public.can_create_menu() OR public.can_create_notice() OR public.can_decide_practice()
   OR public.can_moderate_comments() OR public.can_manage_ob_meet() THEN RAISE EXCEPTION 'Unassigned capabilities leaked'; END IF;
 PERFORM pg_temp.use_comment_capability_actor(3);
 IF public.can_moderate_comments() THEN RAISE EXCEPTION 'Display label granted moderation'; END IF;
 UPDATE public.comments SET content='合成拒否編集' WHERE id='b6101312-0000-4000-8300-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Non-author edited another comment'; END IF;
 DELETE FROM public.comments WHERE id='b6101312-0000-4000-8300-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Non-moderator directly deleted another comment'; END IF;
 BEGIN
  PERFORM public.delete_comment_with_sheet('b6101312-0000-4000-8300-000000000001','app');
  RAISE EXCEPTION 'Non-moderator RPC deleted another comment';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.delete_comment_with_sheet('b6101312-0000-4000-8400-000000000001','sheet');
  RAISE EXCEPTION 'Non-moderator RPC deleted sheet reply';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.comments SET content='合成本人編集' WHERE id='b6101312-0000-4000-8300-000000000003';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Author lost comment editing'; END IF;
 IF public.delete_comment_with_sheet('b6101312-0000-4000-8300-000000000003','app') IS DISTINCT FROM 'b6101312-0000-4000-8300-000000000003'::uuid THEN RAISE EXCEPTION 'Author lost comment deletion'; END IF;

 PERFORM pg_temp.use_comment_capability_actor(1);
 IF NOT public.can_moderate_comments() OR public.can_manage_members() OR public.can_manage_system() THEN RAISE EXCEPTION 'Moderation fixture is not independent'; END IF;
 UPDATE public.comments SET content='合成拒否編集' WHERE id='b6101312-0000-4000-8300-000000000001';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>0 THEN RAISE EXCEPTION 'Moderation granted other authors text editing'; END IF;
 IF public.delete_comment_with_sheet('b6101312-0000-4000-8300-000000000001','app') IS DISTINCT FROM 'b6101312-0000-4000-8300-000000000001'::uuid THEN RAISE EXCEPTION 'Moderation RPC could not delete another comment'; END IF;
 IF public.delete_comment_with_sheet('b6101312-0000-4000-8400-000000000001','sheet') IS DISTINCT FROM 'b6101312-0000-4000-8400-000000000001'::uuid THEN RAISE EXCEPTION 'Moderation RPC could not delete sheet reply'; END IF;
 DELETE FROM public.comments WHERE id='b6101312-0000-4000-8300-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT; IF n<>1 THEN RAISE EXCEPTION 'Moderation RLS could not delete another comment'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.comments WHERE id::text LIKE 'b6101312-%')
   OR EXISTS(SELECT 1 FROM public.sheet_record_replies WHERE id='b6101312-0000-4000-8400-000000000001') THEN
   RAISE EXCEPTION 'Deletion RPC or RLS left its target row';
 END IF;
 IF (SELECT count(*) FROM public.sheet_reply_deletions WHERE id IN
   ('b6101312-0000-4000-8300-000000000001','b6101312-0000-4000-8300-000000000002','b6101312-0000-4000-8300-000000000003','b6101312-0000-4000-8400-000000000001'))<>4 THEN
   RAISE EXCEPTION 'Deletion receipts missing';
 END IF;
END $$;

-- A member manager cannot revoke the final role flag; another assigned manager permits it.
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
UPDATE public.roles SET can_manage_members=false WHERE id<>'b6101312-0000-4000-8100-000000000002';
SELECT set_config('request.headers','{}',true);
SELECT pg_temp.use_comment_capability_actor(4);
SET LOCAL ROLE authenticated;
DO $$ DECLARE rejected boolean:=false; BEGIN
 BEGIN
  UPDATE public.roles SET can_manage_members=false WHERE id='b6101312-0000-4000-8100-000000000002';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM<>'cannot remove the last member manager role' THEN RAISE; END IF;
  rejected:=true;
 END;
 IF NOT rejected OR NOT public.can_manage_members() THEN RAISE EXCEPTION 'Final member manager role flag was revoked'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.roles(id,name,can_manage_members) VALUES('b6101312-0000-4000-8100-000000000010','合成別部員管理',true);
INSERT INTO public.profile_roles(profile_id,role_id) VALUES('b6101312-0000-4000-8000-000000000005','b6101312-0000-4000-8100-000000000010');
SELECT pg_temp.use_comment_capability_actor(4);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 UPDATE public.roles SET can_manage_members=false WHERE id='b6101312-0000-4000-8100-000000000002';
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Another assigned manager did not permit revoking the role flag'; END IF;
 PERFORM pg_temp.use_comment_capability_actor(5);
 IF NOT public.can_manage_members() THEN RAISE EXCEPTION 'Remaining manager lost their capability'; END IF;
END $$;
RESET ROLE;
SELECT 'Eight-role OR, comment author editing, moderation RLS/RPC, sheet deletion receipts and final member-manager protection passed' AS result;
ROLLBACK;
