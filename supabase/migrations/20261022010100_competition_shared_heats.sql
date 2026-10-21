-- A heat is a shared container. Entrant division belongs to the event and ranks,
-- while the historical scope remains the heat identity (so existing slots stay put).
DO $$
DECLARE
 definition text;
 routine text;
 old_clause text;
 new_clause text := $clause$data->>'heatScope' NOT IN ('男子','女子','混合')$clause$;
BEGIN
 FOREACH routine IN ARRAY ARRAY['public.mutate_competition_meet_base(text,uuid,jsonb)','public.apply_competition_sheet_edits(uuid,jsonb,jsonb,boolean)'] LOOP
  definition:=pg_get_functiondef(routine::regprocedure);
  old_clause:=CASE WHEN routine LIKE '%_base(%' THEN $clause$data->>'heatScope' NOT IN (source_event.division,'混合')$clause$ ELSE $clause$data->>'heatScope' NOT IN (e.division,'混合')$clause$ END;
  IF strpos(definition,old_clause)>0 THEN
   IF length(definition)-length(replace(definition,old_clause,''))<>length(old_clause) THEN RAISE EXCEPTION 'meet_heat_definition_changed'; END IF;
   EXECUTE replace(definition,old_clause,new_clause);
  ELSIF strpos(definition,new_clause)=0 THEN
   RAISE EXCEPTION 'meet_heat_definition_changed';
  END IF;
 END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
