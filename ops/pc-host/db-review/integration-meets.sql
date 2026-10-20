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
\echo 'PASS: current division, mirror ordering, relay, and OB operator acceptance'
