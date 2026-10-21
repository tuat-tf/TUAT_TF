-- Synthetic actors are provided by meet-fixture.sql; caller owns rollback.
DO $$
DECLARE competition text:='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'; actor uuid; staff_role uuid:=gen_random_uuid();
 male_person uuid:=gen_random_uuid(); female_person uuid:=gen_random_uuid(); male uuid:=gen_random_uuid(); female uuid:=gen_random_uuid();
 male_event text:='男子合成100m'; female_event text:='女子合成100m'; male_before jsonb; male_data jsonb; female_data jsonb; command jsonb; sheet_command jsonb;
 sheet_request uuid:=gen_random_uuid(); response jsonb;
BEGIN
 SELECT id INTO actor FROM public.profiles WHERE approved AND status='active' LIMIT 1;
 IF actor IS NULL THEN RAISE EXCEPTION 'Shared heat fixture actor missing'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.roles(id,name,can_manage_ob_meet) VALUES(staff_role,'合成共通組担当',true);
 INSERT INTO public.profile_roles(profile_id,role_id) VALUES(actor,staff_role);
 INSERT INTO public.competition_meet_events(competition_id,name,family,division,discipline,wind,capacity)
 VALUES(competition,male_event,'合成100m','男子','track',false,8),(competition,female_event,'合成100m','女子','track',false,8);
 INSERT INTO public.competition_participants(id,competition_id,name,grade)
 VALUES(male_person,competition,'Synthetic male','B1'),(female_person,competition,'Synthetic female','B1');
 male_data:=jsonb_build_object('entryId',male,'group',1,'order',1,'heatScope','男子','status','entered','trials',jsonb_build_array(jsonb_build_object('mark','12.00','wind','','status','valid')));
 female_data:=jsonb_build_object('entryId',female,'group',NULL,'order',NULL,'status','entered','trials','[]'::jsonb);
 INSERT INTO public.competition_appearances(id,competition_id,participant_id,event_name,ordinal,operation_key,performance)
 VALUES(male,competition,male_person,male_event,1,male::text,male_data),(female,competition,female_person,female_event,1,female::text,female_data);
 UPDATE public.competition_meet_events SET confirmed=true WHERE competition_id=competition AND name=male_event;
 SELECT to_jsonb(a) INTO male_before FROM public.competition_appearances a WHERE id=male;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 female_data:=female_data||jsonb_build_object('group',1,'order',2,'heatScope','男子');
 command:=jsonb_build_object('action','event.save','event',female_event,'revision',0,'expectedConfirmed',false,'confirmed',false,'backend',public.get_competition_meet_backend(),
  'changes',jsonb_build_array(jsonb_build_object('id',female,'revision',0,'performance',female_data)));
 PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command);
 IF (SELECT performance FROM public.competition_appearances WHERE id=female) IS DISTINCT FROM female_data
  OR (SELECT event_name FROM public.competition_appearances WHERE id=female)<>female_event
  OR (SELECT division FROM public.competition_meet_events WHERE competition_id=competition AND name=female_event)<>'女子'
  OR (SELECT to_jsonb(a) FROM public.competition_appearances a WHERE id=male) IS DISTINCT FROM male_before THEN RAISE EXCEPTION 'Joining existing heat changed division or confirmed result'; END IF;

 -- Sheet edits use the same old heat address without changing entrant division.
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 sheet_command:=jsonb_build_array(jsonb_build_object('event',female_event,'operationRevision',1,'entryId',female,'entryRevision',1,'status','entered','position',true,'group',1,'order',3,'heatScope','男子'));
 response:=public.apply_competition_sheet_edits(sheet_request,NULL,sheet_command,true);
 IF response->>'dryRun'<>'true' OR (SELECT performance FROM public.competition_appearances WHERE id=female) IS DISTINCT FROM female_data THEN RAISE EXCEPTION 'Shared heat sheet dry run wrote data'; END IF;
 response:=public.apply_competition_sheet_edits(sheet_request,NULL,sheet_command,false);
 IF public.apply_competition_sheet_edits(sheet_request,NULL,sheet_command,false) IS DISTINCT FROM response
  OR (SELECT performance FROM public.competition_appearances WHERE id=female) IS DISTINCT FROM female_data||jsonb_build_object('order',3) THEN RAISE EXCEPTION 'Shared heat sheet save/replay failed'; END IF;

 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 command:=command||jsonb_build_object('revision',2);
 BEGIN
  PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command||jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('id',male,'revision',0,'performance',male_data||jsonb_build_object('order',4)))));
  RAISE EXCEPTION 'Confirmed other division moved';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'meet_confirmed' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command||jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('id',female,'revision',2,'performance',female_data||jsonb_build_object('order',1)))));
  RAISE EXCEPTION 'Occupied cross-division lane accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'meet_position' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.mutate_competition_meet(competition,gen_random_uuid(),command||jsonb_build_object('changes',jsonb_build_array(jsonb_build_object('id',female,'revision',2,'performance',female_data||jsonb_build_object('heatScope','不明')))));
  RAISE EXCEPTION 'Invalid heat scope accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'meet_invalid' THEN RAISE; END IF; END;
 IF (SELECT to_jsonb(a) FROM public.competition_appearances a WHERE id=male) IS DISTINCT FROM male_before
  OR NOT (SELECT confirmed FROM public.competition_meet_events WHERE competition_id=competition AND name=male_event)
  OR (SELECT performance FROM public.competition_appearances WHERE id=female) IS DISTINCT FROM female_data||jsonb_build_object('order',3) THEN RAISE EXCEPTION 'Rejected shared-heat save changed records'; END IF;
END $$;
SELECT jsonb_build_object('existingHeatAcrossDivisions',true,'divisionRetained',true,'confirmedResultProtected',true,'sharedLaneCollision',true,'sheetDryRunAndReplay',true);
