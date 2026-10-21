-- Extend only event.save in the existing checked mutation. Authentication,
-- backend fencing, advisory lock, immutable requests and all other actions stay
-- in that implementation. Every replacement is exact and repeatable.
DO $migration$
DECLARE definition text; patch jsonb; old_clause text; new_clause text;
BEGIN
 -- Older migration sources used CRLF. Normalize line endings before exact
 -- multiline matching without relaxing any of the expected SQL clauses.
 definition:=replace(pg_get_functiondef('public.mutate_competition_meet_base(text,uuid,jsonb)'::regprocedure),E'\r','');
 FOR patch IN SELECT value FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_array(
   $old$IF NOT FOUND OR (e.revision IS DISTINCT FROM (p_command->>'revision')::integer AND NOT (p_command->'expectedConfirmed' IS NOT NULL AND e.confirmed IS NOT DISTINCT FROM (p_command->>'expectedConfirmed')::boolean AND e.confirmed IS NOT DISTINCT FROM (p_command->>'confirmed')::boolean)) THEN RAISE EXCEPTION 'meet_conflict'; END IF;$old$,
   $new$IF NOT FOUND OR (e.revision IS DISTINCT FROM (p_command->>'revision')::integer AND ((p_command ? 'confirmEvents') OR NOT (p_command->'expectedConfirmed' IS NOT NULL AND e.confirmed IS NOT DISTINCT FROM (p_command->>'expectedConfirmed')::boolean AND e.confirmed IS NOT DISTINCT FROM (p_command->>'confirmed')::boolean))) THEN RAISE EXCEPTION 'meet_conflict'; END IF;$new$
  ),
  jsonb_build_array(
   $old$IF e.confirmed AND (p_command->>'confirmed')::boolean AND jsonb_array_length(p_command->'changes')>0 THEN RAISE EXCEPTION 'meet_confirmed'; END IF;$old$,
   $new$IF e.confirmed AND (p_command->>'confirmed')::boolean AND jsonb_array_length(p_command->'changes')>0 AND NOT (p_command ? 'confirmEvents') THEN RAISE EXCEPTION 'meet_confirmed'; END IF;$new$
  ),
  jsonb_build_array(
   $old$before_value:=jsonb_build_object('event',to_jsonb(e),'appearances',(SELECT jsonb_agg(to_jsonb(x)) FROM public.competition_appearances x WHERE competition_id=p_competition_id AND id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_command->'changes'))));$old$,
   $new$-- confirmEvents carries the expected state of every event in the family,
   -- including already-confirmed divisions. Missing/stale lists never partially
   -- confirm or unlock the family.
   IF p_command ? 'confirmEvents' THEN
    IF NOT coalesce((rights->>'groups')::boolean,false) OR NOT coalesce((rights->>'record')::boolean,false) THEN RAISE EXCEPTION 'meet_forbidden' USING ERRCODE='42501'; END IF;
    IF jsonb_typeof(p_command->'confirmEvents') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'meet_invalid'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_command->'confirmEvents') LOOP
     IF jsonb_typeof(item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'meet_invalid'; END IF;
     IF jsonb_typeof(item->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'revision') IS DISTINCT FROM 'number'
      OR item->>'revision' !~ '^(0|[1-9][0-9]*)$' OR jsonb_typeof(item->'confirmed') IS DISTINCT FROM 'boolean'
      OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) key WHERE key NOT IN ('name','revision','confirmed')) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
    END LOOP;
    IF (SELECT count(DISTINCT value->>'name') FROM jsonb_array_elements(p_command->'confirmEvents'))<>jsonb_array_length(p_command->'confirmEvents') THEN RAISE EXCEPTION 'meet_invalid'; END IF;
    PERFORM 1 FROM public.competition_meet_events WHERE competition_id=p_competition_id AND family=e.family ORDER BY name FOR UPDATE;
    IF jsonb_array_length(p_command->'confirmEvents')<>(SELECT count(*) FROM public.competition_meet_events WHERE competition_id=p_competition_id AND family=e.family)
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_command->'confirmEvents') expected
      WHERE NOT EXISTS(SELECT 1 FROM public.competition_meet_events actual WHERE actual.competition_id=p_competition_id AND actual.family=e.family
       AND actual.name=expected->>'name' AND actual.revision::text=expected->>'revision' AND actual.confirmed=(expected->>'confirmed')::boolean))
    THEN RAISE EXCEPTION 'meet_conflict'; END IF;
   END IF;
   before_value:=jsonb_build_object('event',to_jsonb(e),'appearances',(SELECT jsonb_agg(to_jsonb(x)) FROM public.competition_appearances x WHERE competition_id=p_competition_id AND id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_command->'changes'))));
   IF p_command ? 'confirmEvents' THEN
    before_value:=before_value||jsonb_build_object('familyEvents',(SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name) FROM public.competition_meet_events x WHERE competition_id=p_competition_id AND family=e.family));
   END IF;$new$
  ),
  jsonb_build_array(
   $old$IF source_event.name<>e.name AND source_event.confirmed THEN RAISE EXCEPTION 'meet_confirmed'; END IF;$old$,
   $new$IF source_event.confirmed AND (source_event.name<>e.name OR (p_command ? 'confirmEvents')) THEN RAISE EXCEPTION 'meet_confirmed'; END IF;$new$
  ),
  jsonb_build_array(
   $old$-- Include both divisions of a shared family when checking assigned slots.
   IF EXISTS(SELECT 1 FROM public.competition_appearances x JOIN public.competition_meet_events event ON event.competition_id=x.competition_id AND event.name=x.event_name WHERE x.competition_id=p_competition_id AND event.family=e.family AND x.performance->>'status'<>'DNS' AND x.performance->>'group' IS NOT NULL AND x.performance->>'order' IS NOT NULL GROUP BY coalesce(x.performance->>'heatScope',event.division),x.performance->>'group',x.performance->>'order' HAVING count(*)>1) THEN RAISE EXCEPTION 'meet_position'; END IF;
   IF (p_command->>'confirmed')::boolean AND EXISTS(SELECT 1 FROM public.competition_appearances x JOIN public.competition_participants person ON person.id=x.participant_id WHERE x.competition_id=p_competition_id AND x.event_name=e.name AND x.state='registered' AND NOT person.absent AND NOT person.deleted AND x.performance->>'status'='entered' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(x.performance->'trials') t WHERE t->>'status' IN ('valid','foul'))) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
   UPDATE public.competition_meet_events SET confirmed=CASE WHEN name=e.name THEN (p_command->>'confirmed')::boolean ELSE confirmed END,revision=revision+1 WHERE competition_id=p_competition_id AND (name=e.name OR name IN (SELECT x.event_name FROM public.competition_appearances x WHERE x.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_command->'changes'))));$old$,
   $new$-- A pure unlock only changes confirmation/revision. It must remain
   -- possible even when old appearances contain broken trials or duplicate slots.
   IF (p_command->>'confirmed')::boolean OR jsonb_array_length(p_command->'changes')>0 THEN
    IF (p_command ? 'confirmEvents') AND (p_command->>'confirmed')::boolean THEN
     -- Validate every active appearance, including unchanged rows in the other
     -- divisions, before a family is declared complete.
     FOR a IN SELECT x.* FROM public.competition_appearances x
      JOIN public.competition_meet_events event ON event.competition_id=x.competition_id AND event.name=x.event_name
      JOIN public.competition_participants person ON person.id=x.participant_id
      WHERE x.competition_id=p_competition_id AND event.family=e.family AND x.state='registered' AND NOT person.absent AND NOT person.deleted
      ORDER BY x.id FOR UPDATE OF x LOOP
      SELECT * INTO source_event FROM public.competition_meet_events WHERE competition_id=p_competition_id AND name=a.event_name;
      data:=a.performance;
      IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR data->>'entryId' IS DISTINCT FROM a.id::text OR jsonb_typeof(data->'status') IS DISTINCT FROM 'string'
       OR data->>'status' NOT IN ('entered','DNS','DNF','DQ') OR jsonb_typeof(data->'trials') IS DISTINCT FROM 'array'
       OR NOT data?'group' OR NOT data?'order' OR jsonb_typeof(data->'group') NOT IN ('number','null') OR jsonb_typeof(data->'order') NOT IN ('number','null')
       OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) key WHERE key NOT IN ('entryId','group','order','status','trials','heatScope')) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
      IF (data->>'group' IS NOT NULL AND (data->>'group') !~ '^[1-9][0-9]?$')
       OR (data->>'order' IS NOT NULL AND ((data->>'order') !~ '^[1-9][0-9]{0,2}$' OR (data->>'order')::integer>coalesce(source_event.capacity,600)))
       OR (data->>'heatScope' IS NOT NULL AND data->>'heatScope' NOT IN ('男子','女子','混合'))
       OR jsonb_array_length(data->'trials')>(CASE source_event.discipline WHEN 'track' THEN 1 WHEN 'height' THEN 30 ELSE 6 END) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
      FOR trial IN SELECT value FROM jsonb_array_elements(data->'trials') LOOP
       IF NOT public.competition_meet_trial_valid(trial,source_event.discipline,source_event.wind) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
      END LOOP;
      IF data->>'status'='entered' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(data->'trials') t WHERE t->>'status' IN ('valid','foul')) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
     END LOOP;
    END IF;
    -- Legacy saves keep their existing collision scope. Family confirmations
    -- consider active entrants, while retaining confirmed rows as occupied slots.
    IF EXISTS(SELECT 1 FROM public.competition_appearances x
     JOIN public.competition_meet_events event ON event.competition_id=x.competition_id AND event.name=x.event_name
     JOIN public.competition_participants person ON person.id=x.participant_id
     WHERE x.competition_id=p_competition_id AND event.family=e.family
      AND (NOT (p_command ? 'confirmEvents') OR (x.state='registered' AND NOT person.absent AND NOT person.deleted))
      AND x.performance->>'status'<>'DNS' AND x.performance->>'group' IS NOT NULL AND x.performance->>'order' IS NOT NULL
     GROUP BY coalesce(x.performance->>'heatScope',event.division),x.performance->>'group',x.performance->>'order' HAVING count(*)>1) THEN RAISE EXCEPTION 'meet_position'; END IF;
    IF NOT (p_command ? 'confirmEvents') AND (p_command->>'confirmed')::boolean
     AND EXISTS(SELECT 1 FROM public.competition_appearances x JOIN public.competition_participants person ON person.id=x.participant_id WHERE x.competition_id=p_competition_id AND x.event_name=e.name AND x.state='registered' AND NOT person.absent AND NOT person.deleted AND x.performance->>'status'='entered' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(x.performance->'trials') t WHERE t->>'status' IN ('valid','foul'))) THEN RAISE EXCEPTION 'meet_invalid'; END IF;
   END IF;
   IF p_command ? 'confirmEvents' THEN
    UPDATE public.competition_meet_events SET confirmed=(p_command->>'confirmed')::boolean,revision=revision+1 WHERE competition_id=p_competition_id AND family=e.family;
   ELSE
    UPDATE public.competition_meet_events SET confirmed=CASE WHEN name=e.name THEN (p_command->>'confirmed')::boolean ELSE confirmed END,revision=revision+1 WHERE competition_id=p_competition_id AND (name=e.name OR name IN (SELECT x.event_name FROM public.competition_appearances x WHERE x.id IN (SELECT (value->>'id')::uuid FROM jsonb_array_elements(p_command->'changes'))));
   END IF;$new$
  )
 )) LOOP
  old_clause:=patch->>0;new_clause:=patch->>1;
  IF strpos(definition,new_clause)>0 THEN
   IF length(definition)-length(replace(definition,new_clause,''))<>length(new_clause) THEN RAISE EXCEPTION 'meet_family_confirmation_definition_changed'; END IF;
  ELSIF strpos(definition,old_clause)>0 THEN
   IF length(definition)-length(replace(definition,old_clause,''))<>length(old_clause) THEN RAISE EXCEPTION 'meet_family_confirmation_definition_changed'; END IF;
   definition:=replace(definition,old_clause,new_clause);
  ELSE
   RAISE EXCEPTION 'meet_family_confirmation_definition_changed';
  END IF;
 END LOOP;
 EXECUTE definition;
END $migration$;
-- CREATE OR REPLACE retains the existing inaccessible base-function ACL.
NOTIFY pgrst,'reload schema';
