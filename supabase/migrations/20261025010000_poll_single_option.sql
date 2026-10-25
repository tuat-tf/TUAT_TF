-- Allow a poll with a single option (owner request 2026-10-25). Only the minimum-option condition changes;
-- each function's current definition is rewritten in place, so nothing else in it can drift. Idempotent.
DO $$
DECLARE
  target record;
  definition text;
BEGIN
  FOR target IN SELECT * FROM (VALUES
    ('public.save_tweet(uuid,jsonb,text[],uuid[],boolean,text)'::regprocedure, 'cardinality(options) < 2', 'cardinality(options) < 1'),
    ('public.save_note_article(uuid,uuid,timestamptz,jsonb,uuid[],uuid[],jsonb,boolean)'::regprocedure,
      'cardinality(kept) + jsonb_array_length(p_new_options) < 2', 'cardinality(kept) + jsonb_array_length(p_new_options) < 1')
  ) AS t(fn, old_rule, new_rule) LOOP
    definition := pg_get_functiondef(target.fn);
    IF position(target.new_rule IN definition) > 0 THEN CONTINUE; END IF;
    IF (length(definition) - length(replace(definition, target.old_rule, ''))) / length(target.old_rule) <> 1 THEN
      RAISE EXCEPTION 'unexpected poll rule in %', target.fn;
    END IF;
    EXECUTE replace(definition, target.old_rule, target.new_rule);
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
