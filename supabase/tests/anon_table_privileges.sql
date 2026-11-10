-- Isolated, synthetic DB only. The migration and the probe table roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_database() <> 'tuat_rls_review' OR to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION 'Use the isolated synthetic tuat_rls_review database';
  END IF;
END $$;
\ir ../migrations/20261111010000_revoke_anon_table_privileges.sql
\ir ../migrations/20261111010000_revoke_anon_table_privileges.sql

DO $$
DECLARE bad text;
BEGIN
  -- anon: no privilege of any kind on any table/view/sequence in public
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege('anon', c.oid, 'SELECT') OR has_table_privilege('anon', c.oid, 'INSERT')
      OR has_table_privilege('anon', c.oid, 'UPDATE') OR has_table_privilege('anon', c.oid, 'DELETE')
      OR has_table_privilege('anon', c.oid, 'TRUNCATE') OR has_table_privilege('anon', c.oid, 'REFERENCES')
      OR has_table_privilege('anon', c.oid, 'TRIGGER'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'anon still has table privileges on: %', bad; END IF;

  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S'
    AND (has_sequence_privilege('anon', c.oid, 'USAGE') OR has_sequence_privilege('anon', c.oid, 'SELECT')
      OR has_sequence_privilege('anon', c.oid, 'UPDATE'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'anon still has sequence privileges on: %', bad; END IF;

  -- authenticated: no TRUNCATE/REFERENCES/TRIGGER anywhere in public
  SELECT string_agg(c.relname, ', ') INTO bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege('authenticated', c.oid, 'TRUNCATE')
      OR has_table_privilege('authenticated', c.oid, 'REFERENCES')
      OR has_table_privilege('authenticated', c.oid, 'TRIGGER'));
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'authenticated still has TRUNCATE/REFERENCES/TRIGGER on: %', bad; END IF;

  -- authenticated keeps normal access (RLS guards rows); anon-callable functions stay callable
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on profiles';
  END IF;
  IF to_regprocedure('public.backup_read_only()') IS NOT NULL
     AND NOT has_function_privilege('anon', 'public.backup_read_only()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon lost EXECUTE on backup_read_only';
  END IF;
END $$;

-- Tables created from now on must not be re-granted (default privileges), for the roles the migration covers.
DO $$
DECLARE bad boolean;
BEGIN
  IF current_user IN ('postgres', 'supabase_admin') THEN
    CREATE TABLE public.__anon_priv_probe (id integer);
    SELECT has_table_privilege('anon', 'public.__anon_priv_probe', 'SELECT')
        OR has_table_privilege('authenticated', 'public.__anon_priv_probe', 'TRUNCATE') INTO bad;
    IF bad THEN RAISE EXCEPTION 'default privileges still grant anon/TRUNCATE on new tables'; END IF;
  END IF;
END $$;

DO $$ BEGIN RAISE NOTICE 'PASS: anon has no public table privileges; authenticated has no TRUNCATE/REFERENCES/TRIGGER'; END $$;
ROLLBACK;
