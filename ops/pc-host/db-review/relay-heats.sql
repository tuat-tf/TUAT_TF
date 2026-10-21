\set ON_ERROR_STOP on
-- Synthetic-only migration rehearsal; never restore production rows this way.
BEGIN;
DO $$ BEGIN
 IF current_database()<>'tuat_rls_review' THEN RAISE EXCEPTION 'Synthetic relay review database required'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.headers','{"x-tuat-mirror":"1"}',true);
CREATE TEMP TABLE relay_repeat_before AS SELECT to_jsonb(e) AS value FROM public.competition_meet_events e
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー';
\ir /review/supabase/migrations/20261022010000_competition_relay_heats.sql
DO $$ BEGIN
 IF (SELECT value FROM relay_repeat_before) IS DISTINCT FROM (SELECT to_jsonb(e) FROM public.competition_meet_events e WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー') THEN RAISE EXCEPTION 'Repeated merge changed canonical event'; END IF;
END $$;

-- Recreate the two original rows from the migration's private audit in this
-- rollback-only synthetic DB, then give both heats populated runner results.
CREATE TEMP TABLE relay_original_rows AS SELECT value FROM public.competition_meet_requests q CROSS JOIN LATERAL jsonb_array_elements(q.before_data->'events')
WHERE q.id='438bf967-7a44-473a-a4b5-9027dc76c5af';
DELETE FROM public.competition_meet_requests WHERE id='438bf967-7a44-473a-a4b5-9027dc76c5af';
DELETE FROM public.competition_meet_events WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー';
INSERT INTO public.competition_meet_events SELECT (jsonb_populate_record(NULL::public.competition_meet_events,value)).* FROM relay_original_rows;
UPDATE public.competition_meet_events SET relay_results=jsonb_set(relay_results,'{0}',jsonb_build_object('lane',1,'name','Synthetic first team','time','2:43.00','members',jsonb_build_array('First A','First B','First C','First D'))),confirmed=true,revision=17
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー';
UPDATE public.competition_meet_events SET relay_results=jsonb_set(relay_results,'{0}',jsonb_build_object('lane',1,'name','Synthetic second team','time','2:45.00','members',jsonb_build_array('Second A','Second B','Second C','Second D'))),confirmed=false,revision=3,starts_at='16:00'
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー 2組目';
CREATE TEMP TABLE relay_merge_before AS SELECT to_jsonb(e) AS value FROM public.competition_meet_events e
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name IN ('4×300mリレー','4×300mリレー 2組目');
CREATE TEMP TABLE relay_others_before AS SELECT to_jsonb(e) AS value FROM public.competition_meet_events e
WHERE competition_id<>'3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' OR name NOT IN ('4×300mリレー','4×300mリレー 2組目');
\ir /review/supabase/migrations/20261022010000_competition_relay_heats.sql
DO $$
DECLARE saved jsonb; first_before jsonb; second_before jsonb; archived jsonb;
BEGIN
 SELECT to_jsonb(e) INTO saved FROM public.competition_meet_events e WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー';
 SELECT value INTO first_before FROM relay_merge_before WHERE value->>'name'='4×300mリレー';
 SELECT value INTO second_before FROM relay_merge_before WHERE value->>'name'='4×300mリレー 2組目';
 IF jsonb_array_length(saved->'relay_results')<>12 OR (saved->>'revision')::integer<>18 OR (saved->>'confirmed')::boolean
  OR saved->'starts_at' IS DISTINCT FROM first_before->'starts_at'
  OR (SELECT jsonb_agg(value ORDER BY ordinal) FROM jsonb_array_elements(saved->'relay_results') WITH ORDINALITY s(value,ordinal) WHERE ordinal<=6) IS DISTINCT FROM first_before->'relay_results'
  OR (SELECT jsonb_agg(value-'heat' ORDER BY ordinal) FROM jsonb_array_elements(saved->'relay_results') WITH ORDINALITY s(value,ordinal) WHERE ordinal>6) IS DISTINCT FROM second_before->'relay_results'
 THEN RAISE EXCEPTION 'Merged heat lost results or metadata'; END IF;
 SELECT before_data INTO archived FROM public.competition_meet_requests WHERE id='438bf967-7a44-473a-a4b5-9027dc76c5af';
 IF archived->'events' IS DISTINCT FROM jsonb_build_array(first_before,second_before) THEN RAISE EXCEPTION 'Original event snapshots not retained'; END IF;
 IF EXISTS(SELECT 1 FROM public.competition_meet_events WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー 2組目') THEN RAISE EXCEPTION 'Duplicate event remains'; END IF;
 IF EXISTS((SELECT value FROM relay_others_before EXCEPT SELECT to_jsonb(e) FROM public.competition_meet_events e WHERE competition_id<>'3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' OR name NOT IN ('4×300mリレー','4×300mリレー 2組目'))
  UNION ALL (SELECT to_jsonb(e) FROM public.competition_meet_events e WHERE competition_id<>'3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' OR name NOT IN ('4×300mリレー','4×300mリレー 2組目') EXCEPT SELECT value FROM relay_others_before)) THEN RAISE EXCEPTION 'Unrelated event changed'; END IF;
END $$;
CREATE TEMP TABLE relay_merged_once AS SELECT to_jsonb(e) AS value FROM public.competition_meet_events e
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー';
\ir /review/supabase/migrations/20261022010000_competition_relay_heats.sql
DO $$ BEGIN
 IF (SELECT value FROM relay_merged_once) IS DISTINCT FROM (SELECT to_jsonb(e) FROM public.competition_meet_events e WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー') THEN RAISE EXCEPTION 'Repeat migration overwrote team results'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: relay migration merges exact event, preserves both heats and archived metadata, and is repeatable';
