\set ON_ERROR_STOP on
-- Division fixtures already use BEGIN/ROLLBACK. Their nested BEGIN is a no-op;
-- their ROLLBACK also removes the synthetic actors created immediately before it.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir meet-fixture.sql
\ir /review/supabase/tests/meet-appearance-division.sql
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir meet-fixture.sql
\ir /review/supabase/tests/meet-division-mirror.sql
-- These two fixtures explicitly leave transaction ownership to the caller.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir meet-fixture.sql
\ir /review/supabase/tests/competition-relay-results.sql
\ir /review/supabase/tests/competition-relay-heats.sql
-- Feed actual RPC JSON to the application's read-contract validator.
INSERT INTO public.competition_appearances(id,competition_id,participant_id,event_name,ordinal,operation_key,performance)
SELECT 'd6102101-0000-4000-8300-000000000001',competition_id,id,'男子100m',1,'synthetic-snapshot',
  '{"entryId":"d6102101-0000-4000-8300-000000000001","group":1,"order":1,"status":"entered","trials":[{"mark":"12.34","wind":"+1.0","status":"valid"}]}'
FROM public.competition_participants WHERE competition_id='codex-relay-20261013';
\pset format unaligned
\pset tuples_only on
SELECT 'MEET_SNAPSHOT:'||public.get_competition_meet(competition_id)::text
FROM public.competition_meets WHERE ready ORDER BY competition_id;
\pset tuples_only off
\pset format aligned
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir meet-fixture.sql
\ir /review/supabase/tests/competition-shared-heats.sql
ROLLBACK;
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
\ir meet-fixture.sql
\ir /review/supabase/tests/ob-results-operator-permissions.sql
ROLLBACK;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.profiles) THEN
    RAISE EXCEPTION 'Meet fixture did not roll back';
  END IF;
END $$;
\echo 'PASS: current division, shared heats, mirror ordering, multiheat relay, and OB operator acceptance'
