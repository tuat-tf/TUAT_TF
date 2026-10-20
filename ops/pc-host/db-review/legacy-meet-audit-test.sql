\set ON_ERROR_STOP on
-- Only the fresh isolated runner may create this synthetic legacy source.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir meet-fixture.sql
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
UPDATE public.competition_meets SET ready=false,source_frozen=false,
  staff_role_id='d6102002-0000-4000-8100-000000000001'
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5';
UPDATE public.roles SET can_manage_ob_meet=true WHERE id='d6102002-0000-4000-8100-000000000001';
UPDATE public.profiles SET display_name='Synthetic helper'
WHERE id='d6102002-0000-4000-8000-000000000002';
INSERT INTO public.ob_meet_entries(id,meet_key,submitted_name,grade,profile_id,events,qualification_marks)
VALUES('d6102102-0000-4000-8000-000000000001','ob-2026','Synthetic registered runner','B1',
  'd6102002-0000-4000-8000-000000000001',ARRAY['男子100m','男子100m'],'{"男子100m":"12.00"}');
INSERT INTO public.ob_event_operations(meet_key,event_name,revision,data)
VALUES('ob-2026','男子100m',3,'{"confirmed":true,"participants":[
  {"entryId":"d6102102-0000-4000-8000-000000000001","group":1,"order":1,"status":"entered","trials":[{"mark":"12.34","wind":"+1.0","status":"valid"}]},
  {"entryId":"d6102102-0000-4000-8000-000000000002","group":1,"order":2,"status":"entered","trials":[{"mark":"13.45","wind":"+1.0","status":"valid"}]}
]}');
INSERT INTO public.ob_entry_changes(entry_id,actor_id,before_data,after_data)
VALUES(NULL,NULL,'{"id":"d6102102-0000-4000-8000-000000000002","meet_key":"ob-2026","submitted_name":"Synthetic removed runner","grade":"B2"}','{}');
INSERT INTO public.ob_duty_roles(id,meet_key,slot_time,event_name,name,abbreviation,required_count)
VALUES('d6102102-0000-4000-8100-000000000001','ob-2026','11:00','100m','Synthetic timekeeper','ST',2);
INSERT INTO public.ob_entry_duties(meet_key,entry_id,slot_time,event_name,role_ids)
VALUES('ob-2026','d6102102-0000-4000-8000-000000000001','11:00','100m',
  ARRAY['d6102102-0000-4000-8100-000000000001'::uuid]);
INSERT INTO public.ob_meet_duties(meet_key,profile_id,slot_time,event_name,assignment,role_ids)
VALUES('ob-2026','d6102002-0000-4000-8000-000000000002','11:00','100m','',
  ARRAY['d6102102-0000-4000-8100-000000000001'::uuid]);
INSERT INTO public.ob_party_responses(id,meet_key,submitted_name,group_label,status,entry_id)
VALUES('d6102102-0000-4000-8200-000000000001','ob-2026','Synthetic registered runner','B1','未回答',
  'd6102102-0000-4000-8000-000000000001');
SELECT set_config('request.headers','{}',true);

-- The runner validates these exact SELECT outputs; no copied audit expression.
\pset format unaligned
\pset tuples_only on
\ir legacy-meet-audit.sql
SELECT public.refresh_competition_meet_import(false,NULL);
SELECT public.set_competition_meet_source_frozen(true);
SELECT public.refresh_competition_meet_import(true,public.competition_meet_source_digest());
\ir legacy-meet-audit.sql
DO $$ BEGIN
  IF (SELECT count(*) FROM public.competition_appearances WHERE qualification_mark='12.00')<>2
    OR NOT EXISTS(SELECT 1 FROM public.competition_participants
      WHERE id='d6102102-0000-4000-8000-000000000002' AND deleted)
    OR NOT EXISTS(SELECT 1 FROM public.competition_appearances
      WHERE participant_id='d6102102-0000-4000-8000-000000000002'
        AND state='cancelled' AND performance->'trials'->0->>'mark'='13.45') THEN
    RAISE EXCEPTION 'Repeated appearance, qualification, or removed result lost during import';
  END IF;
  BEGIN
    UPDATE public.ob_meet_entries SET revision=revision+1 WHERE id='d6102102-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Activated legacy source remained writable';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'meet_migrated_reload' THEN RAISE; END IF;
  END;
END $$;
-- A real permitted division correction keeps the permanent ID and trial data.
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
UPDATE public.competition_meet_events SET confirmed=false
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5';
SELECT set_config('request.headers','{}',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.sub','d6102002-0000-4000-8000-000000000003',true);
SELECT public.mutate_competition_meet(
  '3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5','d6102102-0000-4000-8300-000000000001',
  jsonb_build_object('action','appearance.moveDivision','id',a.id,'revision',a.revision,'event','女子100m','mark','12.00'))
FROM public.competition_appearances a
WHERE a.participant_id='d6102102-0000-4000-8000-000000000001' AND a.ordinal=1;
\ir legacy-meet-missing-appearances.sql
-- Prove the audit distinguishes ready=true from actual appearance coverage.
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
DELETE FROM public.competition_appearances
WHERE participant_id='d6102102-0000-4000-8000-000000000001' AND ordinal=2;
\ir legacy-meet-audit.sql
\ir legacy-meet-missing-appearances.sql
ROLLBACK;
\echo 'PASS: legacy meet aggregate outputs before import, after import, and after canonical changes'
