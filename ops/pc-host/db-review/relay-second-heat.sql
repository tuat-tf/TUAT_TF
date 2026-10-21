\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE relay_before AS SELECT to_jsonb(e) AS value FROM public.competition_meet_events e
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー';
DO $$ BEGIN
 IF (SELECT count(*) FROM relay_before)<>1 THEN RAISE EXCEPTION 'first heat fixture missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.competition_meet_events WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー 2組目' AND jsonb_array_length(relay_results)=6 AND NOT confirmed) THEN RAISE EXCEPTION 'second heat missing'; END IF;
END $$;
UPDATE public.competition_meet_events SET relay_results=jsonb_set(relay_results,'{0,name}','"Synthetic team"')
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー 2組目';
CREATE TEMP TABLE second_before AS SELECT to_jsonb(e) AS value FROM public.competition_meet_events e
WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー 2組目';
\ir /review/supabase/migrations/20261021010100_ob_relay_second_heat.sql
DO $$ BEGIN
 IF (SELECT value FROM relay_before) IS DISTINCT FROM (SELECT to_jsonb(e) FROM public.competition_meet_events e WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー') THEN RAISE EXCEPTION 'first heat changed'; END IF;
 IF (SELECT value FROM second_before) IS DISTINCT FROM (SELECT to_jsonb(e) FROM public.competition_meet_events e WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND name='4×300mリレー 2組目') THEN RAISE EXCEPTION 'second heat overwritten'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: second heat is independent and repeat migration preserves both heats';
