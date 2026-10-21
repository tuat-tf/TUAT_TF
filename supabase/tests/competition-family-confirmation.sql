-- Synthetic actors come from meet-fixture.sql; caller owns rollback.
CREATE FUNCTION pg_temp.family_confirmation_state(competition text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY name) FROM public.competition_meet_events e WHERE competition_id=competition),
  'appearances',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.competition_appearances a WHERE competition_id=competition),
  'requests',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.competition_meet_requests r WHERE competition_id=competition))
$$;
CREATE FUNCTION pg_temp.family_confirmation_command(competition text,anchor text,desired boolean,changes jsonb DEFAULT '[]'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('action','event.save','event',e.name,'revision',e.revision,'expectedConfirmed',e.confirmed,'confirmed',desired,'changes',changes,
  'backend',public.get_competition_meet_backend(),'confirmEvents',(SELECT jsonb_agg(jsonb_build_object('name',f.name,'revision',f.revision,'confirmed',f.confirmed) ORDER BY name)
   FROM public.competition_meet_events f WHERE f.competition_id=e.competition_id AND f.family=e.family))
 FROM public.competition_meet_events e WHERE competition_id=competition AND name=anchor
$$;
CREATE FUNCTION pg_temp.expect_family_confirmation_rejection(competition text,command jsonb,expected text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_state jsonb:=pg_temp.family_confirmation_state(competition);
BEGIN
 BEGIN
  PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command);
  RAISE EXCEPTION 'Family confirmation unexpectedly accepted: %',expected;
 EXCEPTION WHEN raise_exception OR insufficient_privilege THEN
  IF SQLERRM IS DISTINCT FROM expected THEN RAISE; END IF;
 END;
 IF pg_temp.family_confirmation_state(competition) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'Rejected family command partially saved'; END IF;
END $$;

DO $test$
DECLARE competition text:='codex-family-confirmation-20261022'; actor uuid; other_actor uuid; staff_role uuid:=gen_random_uuid();
 male_person uuid:=gen_random_uuid(); female_person uuid:=gen_random_uuid(); inactive_person uuid:=gen_random_uuid();
 male uuid:=gen_random_uuid(); female uuid:=gen_random_uuid(); inactive uuid:=gen_random_uuid();
 male_event text:='男子100m'; female_event text:='女子100m'; command jsonb; result jsonb; request uuid:=gen_random_uuid();
 appearances_before jsonb; family_before jsonb; saved_state jsonb; male_data jsonb; female_data jsonb; changes jsonb; kept_male jsonb;
BEGIN
 SELECT id INTO actor FROM public.profiles WHERE approved AND status='active' ORDER BY id LIMIT 1;
 SELECT id INTO other_actor FROM public.profiles WHERE approved AND status='active' AND id<>actor ORDER BY id LIMIT 1;
 IF actor IS NULL OR other_actor IS NULL THEN RAISE EXCEPTION 'Family confirmation fixture actors missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.roles(id,name,can_manage_ob_meet) VALUES(staff_role,'合成一括確定担当',true);
 INSERT INTO public.profile_roles(profile_id,role_id) VALUES(actor,staff_role);
 INSERT INTO public.competitions(id,name,starts_on) VALUES(competition,'Synthetic family confirmation','2026-10-22');
 INSERT INTO public.competition_meets(competition_id,meet_key,staff_role_id,legacy_source,ready) VALUES(competition,competition,staff_role,'ob-2026',true);
 INSERT INTO public.competition_meet_events(competition_id,name,family,division,discipline,wind,capacity,confirmed)
 VALUES(competition,male_event,'100m','男子','track',false,8,true),
  (competition,female_event,'100m','女子','track',false,8,false),
  (competition,'男子200m','200m','男子','track',false,8,false);
 INSERT INTO public.competition_participants(id,competition_id,name,grade)
 VALUES(male_person,competition,'Synthetic male','B1'),(female_person,competition,'Synthetic female','B1');
 male_data:=jsonb_build_object('entryId',male,'group',1,'order',1,'heatScope','混合','status','entered','trials',jsonb_build_object('broken',true));
 female_data:=jsonb_build_object('entryId',female,'group',1,'order',1,'heatScope','混合','status','entered','trials',jsonb_build_array(jsonb_build_object('mark','13.00','wind','','status','valid')));
 INSERT INTO public.competition_appearances(id,competition_id,participant_id,event_name,ordinal,operation_key,performance)
 VALUES(male,competition,male_person,male_event,1,male::text,male_data),(female,competition,female_person,female_event,1,female::text,female_data);
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 appearances_before:=pg_temp.family_confirmation_state(competition)->'appearances';
 SELECT jsonb_agg(to_jsonb(e) ORDER BY name) INTO family_before FROM public.competition_meet_events e WHERE competition_id=competition AND family='100m';
 command:=pg_temp.family_confirmation_command(competition,male_event,false);
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command||jsonb_build_object('confirmEvents',(command->'confirmEvents')-0),'meet_conflict');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,jsonb_set(command,'{confirmEvents,0,revision}','99'),'meet_conflict');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,jsonb_set(command,'{confirmEvents,0,confirmed}','true'),'meet_conflict');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,jsonb_set(command,'{confirmEvents,0,name}','"男子200m"'),'meet_conflict');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command||jsonb_build_object('confirmEvents','[]'::jsonb),'meet_conflict');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command||jsonb_build_object('confirmEvents',NULL),'meet_invalid');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,jsonb_set(command,'{confirmEvents,0,revision}','"0"'),'meet_invalid');
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,jsonb_set(command,'{revision}','-1'),'meet_conflict');

 -- In an ordinary meet, this approved member may record but cannot group or
 -- confirm. The new family route must require both existing capabilities.
 UPDATE public.competition_meets SET legacy_source=NULL WHERE competition_id=competition;
 PERFORM set_config('request.jwt.claim.sub',other_actor::text,true);
 IF public.competition_meet_permissions(competition)->>'record'<>'true' OR public.competition_meet_permissions(competition)->>'groups'<>'false' THEN RAISE EXCEPTION 'Record-only fixture permission mismatch'; END IF;
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command,'meet_forbidden');
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 UPDATE public.competition_meets SET legacy_source='ob-2026' WHERE competition_id=competition;

 result:=public.mutate_competition_meet(competition,request,command);
 IF EXISTS(SELECT 1 FROM public.competition_meet_events WHERE competition_id=competition AND family='100m' AND (confirmed OR revision<>1))
  OR (SELECT revision FROM public.competition_meet_events WHERE competition_id=competition AND family='200m')<>0
  OR pg_temp.family_confirmation_state(competition)->'appearances' IS DISTINCT FROM appearances_before
  OR (SELECT before_data->'familyEvents' FROM public.competition_meet_requests WHERE id=request) IS DISTINCT FROM family_before
 THEN RAISE EXCEPTION 'Partial-family unlock changed appearances or lost event snapshots'; END IF;
 saved_state:=pg_temp.family_confirmation_state(competition);
 IF public.mutate_competition_meet(competition,request,command) IS DISTINCT FROM result
  OR public.check_competition_meet_mutation(competition,request,command) IS DISTINCT FROM result
  OR pg_temp.family_confirmation_state(competition) IS DISTINCT FROM saved_state THEN RAISE EXCEPTION 'Family unlock replay changed data'; END IF;

 -- Older clients must also be able to escape old invalid records and duplicate
 -- slots with a pure single-event unlock.
 UPDATE public.competition_meet_events SET confirmed=true WHERE competition_id=competition AND name=male_event;
 command:=pg_temp.family_confirmation_command(competition,male_event,false)-'confirmEvents';
 PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command);
 IF (SELECT confirmed FROM public.competition_meet_events WHERE competition_id=competition AND name=male_event)
  OR pg_temp.family_confirmation_state(competition)->'appearances' IS DISTINCT FROM appearances_before THEN RAISE EXCEPTION 'Legacy pure unlock validates or rewrites old appearances'; END IF;

 -- After unlocking, repair the old inputs through the existing regular save.
 male_data:=jsonb_set(male_data,'{trials}',jsonb_build_array(jsonb_build_object('mark','12.00','wind','','status','valid')));
 female_data:=female_data||jsonb_build_object('order',2);
 changes:=jsonb_build_array(jsonb_build_object('id',male,'revision',0,'performance',male_data),jsonb_build_object('id',female,'revision',0,'performance',female_data));
 command:=(pg_temp.family_confirmation_command(competition,male_event,false,changes)-'confirmEvents');
 PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command);
 IF (SELECT performance FROM public.competition_appearances WHERE id=male) IS DISTINCT FROM male_data
  OR (SELECT performance FROM public.competition_appearances WHERE id=female) IS DISTINCT FROM female_data THEN RAISE EXCEPTION 'Re-edit after family unlock failed'; END IF;

 -- Unchanged results in the other division are validated too, and changes
 -- applied earlier in the same call must roll back on any later failure.
 UPDATE public.competition_appearances SET performance=jsonb_set(performance,'{trials}','{}'::jsonb) WHERE id=female;
 changes:=jsonb_build_array(jsonb_build_object('id',male,'revision',1,'performance',jsonb_set(male_data,'{trials,0,mark}','"12.10"')));
 command:=pg_temp.family_confirmation_command(competition,male_event,true,changes);
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command,'meet_invalid');
 UPDATE public.competition_appearances SET performance=jsonb_set(female_data,'{trials,0,mark}','"invalid"') WHERE id=female;
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command,'meet_invalid');
 UPDATE public.competition_appearances SET performance=jsonb_set(female_data,'{trials}','[]'::jsonb) WHERE id=female;
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command,'meet_invalid');
 UPDATE public.competition_appearances SET performance=female_data||jsonb_build_object('order',1) WHERE id=female;
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command,'meet_position');
 UPDATE public.competition_appearances SET performance=female_data WHERE id=female;

 -- Inactive historical rows are retained, but do not prevent active results
 -- from being confirmed.
 INSERT INTO public.competition_participants(id,competition_id,name,grade,deleted) VALUES(inactive_person,competition,'Synthetic inactive','B1',true);
 INSERT INTO public.competition_appearances(id,competition_id,participant_id,event_name,ordinal,operation_key,state,performance)
 VALUES(inactive,competition,inactive_person,female_event,1,inactive::text,'deleted',jsonb_build_object('entryId',inactive,'group',1,'order',1,'heatScope','混合','status','entered','trials','{}'::jsonb));
 changes:=jsonb_build_array(jsonb_build_object('id',female,'revision',1,'performance',jsonb_set(female_data,'{trials,0,mark}','"13.10"')));
 command:=pg_temp.family_confirmation_command(competition,male_event,true,changes);request:=gen_random_uuid();
 result:=public.mutate_competition_meet(competition,request,command);
 IF EXISTS(SELECT 1 FROM public.competition_meet_events WHERE competition_id=competition AND family='100m' AND NOT confirmed)
  OR (SELECT performance->'trials'->0->>'mark' FROM public.competition_appearances WHERE id=female)<>'13.10'
  OR (SELECT performance FROM public.competition_appearances WHERE id=male) IS DISTINCT FROM male_data THEN RAISE EXCEPTION 'Family confirmation did not save all divisions with edited result'; END IF;
 saved_state:=pg_temp.family_confirmation_state(competition);
 IF public.mutate_competition_meet(competition,request,command) IS DISTINCT FROM result
  OR pg_temp.family_confirmation_state(competition) IS DISTINCT FROM saved_state THEN RAISE EXCEPTION 'Family confirmation replay changed data'; END IF;

 -- With a confirmed anchor, only the unconfirmed division may be edited while
 -- completing the family. No confirmed row may slip through the new route.
 PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),pg_temp.family_confirmation_command(competition,male_event,false));
 UPDATE public.competition_meet_events SET confirmed=true WHERE competition_id=competition AND name=male_event;
 SELECT to_jsonb(a) INTO kept_male FROM public.competition_appearances a WHERE id=male;
 command:=pg_temp.family_confirmation_command(competition,male_event,true,jsonb_build_array(jsonb_build_object('id',male,'revision',1,'performance',male_data)));
 PERFORM pg_temp.expect_family_confirmation_rejection(competition,command,'meet_confirmed');
 command:=pg_temp.family_confirmation_command(competition,male_event,true,jsonb_build_array(jsonb_build_object('id',female,'revision',2,'performance',jsonb_set(female_data,'{trials,0,mark}','"13.20"'))));
 PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command);
 IF (SELECT to_jsonb(a) FROM public.competition_appearances a WHERE id=male) IS DISTINCT FROM kept_male
  OR EXISTS(SELECT 1 FROM public.competition_meet_events WHERE competition_id=competition AND family='100m' AND NOT confirmed) THEN RAISE EXCEPTION 'Mixed confirmation changed a previously confirmed appearance'; END IF;
END $test$;

CREATE TEMP TABLE family_confirmation_definition_before AS SELECT pg_get_functiondef('public.mutate_competition_meet_base(text,uuid,jsonb)'::regprocedure) AS value;
\ir /review/supabase/migrations/20261022020000_competition_family_confirmation.sql
DO $$ BEGIN
 IF (SELECT value FROM family_confirmation_definition_before) IS DISTINCT FROM pg_get_functiondef('public.mutate_competition_meet_base(text,uuid,jsonb)'::regprocedure)
  OR has_function_privilege('authenticated','public.mutate_competition_meet_base(text,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('anon','public.mutate_competition_meet_base(text,uuid,jsonb)','EXECUTE')
  OR has_function_privilege('service_role','public.mutate_competition_meet_base(text,uuid,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Family confirmation migration replay or base ACL changed'; END IF;
END $$;
SELECT jsonb_build_object('partialFamilyUnlock',true,'brokenRecordsUnlock',true,'unchangedAppearances',true,'legacyPureUnlock',true,'familyValidation',true,'atomicRejections',true,'replay',true,'confirmedRowsProtected',true,'migrationReplayAndAcl',true);
