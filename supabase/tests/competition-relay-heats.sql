-- Run only in the isolated synthetic DB acceptance transaction.
DO $$
DECLARE actor uuid; other_actor uuid; staff_role uuid:=gen_random_uuid(); competition text:='codex-relay-heats-20261022'; relay text:='4×300mリレー';
 initial jsonb; teams jsonb; third jsonb; input jsonb; response jsonb; request uuid:=gen_random_uuid(); backend text; saved jsonb;
BEGIN
 SELECT id INTO actor FROM public.profiles WHERE approved AND status='active' LIMIT 1;
 SELECT id INTO other_actor FROM public.profiles WHERE approved AND id<>actor LIMIT 1;
 IF actor IS NULL OR other_actor IS NULL THEN RAISE EXCEPTION 'Relay heat fixture actors unavailable'; END IF;
 PERFORM set_config('request.jwt.claim.sub',actor::text,true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 INSERT INTO public.roles(id,name,can_manage_ob_meet) VALUES(staff_role,'合成リレー組担当',true);
 INSERT INTO public.profile_roles(profile_id,role_id) VALUES(actor,staff_role);
 INSERT INTO public.competitions(id,name,starts_on) VALUES(competition,'合成リレー組検証','2026-10-22');
 INSERT INTO public.competition_meets(competition_id,meet_key,staff_role_id,legacy_source,ready) VALUES(competition,competition,staff_role,'ob-2026',true);
 SELECT jsonb_agg(jsonb_build_object('lane',n,'name','','time','','members',jsonb_build_array('','','','')) ORDER BY n) INTO initial FROM generate_series(1,6) n;
 INSERT INTO public.competition_meet_events(competition_id,name,family,division,discipline,wind,capacity,relay_results)
 VALUES(competition,relay,relay,'混合','track',false,6,initial);
 SELECT initial||jsonb_agg(value||jsonb_build_object('heat',2) ORDER BY ordinal) INTO teams FROM jsonb_array_elements(initial) WITH ORDINALITY source(value,ordinal);
 teams:=jsonb_set(jsonb_set(teams,'{6,name}','"第二組チーム"'),'{6,time}','"2:44.00"');
 teams:=jsonb_set(teams,'{6,members}','["第二組一走","第二組二走","第二組三走","第二組四走"]');
 IF NOT public.competition_relay_results_valid(teams,true) THEN RAISE EXCEPTION 'Two heats rejected'; END IF;
 IF public.competition_relay_results_valid(jsonb_set(teams,'{6,heat}','3'),false)
  OR public.competition_relay_results_valid(jsonb_set(teams,'{6,lane}','2'),false)
  OR public.competition_relay_results_valid(jsonb_set(teams,'{6,heat}','null'),false)
  OR public.competition_relay_results_valid(initial||initial,false)
  OR public.competition_relay_results_valid('[]'::jsonb,false) THEN RAISE EXCEPTION 'Malformed heat accepted'; END IF;
 PERFORM set_config('request.jwt.claims','{"role":"authenticated"}',true);
 backend:=public.get_competition_meet_backend();
 input:=jsonb_build_object('action','relay.save','event',relay,'revision',0,'relayResults',teams,'confirmed',false,'backend',backend);
 response:=public.save_competition_relay_checked(competition,request,input);
 IF public.save_competition_relay_checked(competition,request,input) IS DISTINCT FROM response
  OR public.check_competition_meet_mutation(competition,request,input) IS DISTINCT FROM response
  OR (SELECT revision FROM public.competition_meet_events WHERE competition_id=competition AND name=relay)<>1 THEN RAISE EXCEPTION 'Multiheat replay changed event'; END IF;
 BEGIN
  PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input||jsonb_build_object('revision',1,'relayResults',initial));
  RAISE EXCEPTION 'Later heat silently removed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'meet_relay_invalid' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input);
  RAISE EXCEPTION 'Stale heat edit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'meet_conflict' THEN RAISE; END IF; END;
 SELECT teams||jsonb_agg(value||jsonb_build_object('heat',3) ORDER BY ordinal) INTO third FROM jsonb_array_elements(initial) WITH ORDINALITY source(value,ordinal);
 third:=jsonb_set(jsonb_set(third,'{12,name}','"第三組チーム"'),'{12,time}','"-"');
 input:=input||jsonb_build_object('revision',1,'relayResults',third);
 PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input);
 IF (SELECT count(*) FROM public.competition_meet_events WHERE competition_id=competition)<>1
  OR (SELECT relay_results FROM public.competition_meet_events WHERE competition_id=competition AND name=relay) IS DISTINCT FROM third THEN RAISE EXCEPTION 'Third heat needs separate event or lost results'; END IF;
 input:=input||jsonb_build_object('revision',2,'confirmed',true);
 PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input);
 BEGIN
  PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input||jsonb_build_object('revision',3,'relayResults',jsonb_set(third,'{12,time}','"2:40.00"')));
  RAISE EXCEPTION 'Confirmed later heat changed';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'meet_confirmed' THEN RAISE; END IF; END;
 PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input||jsonb_build_object('revision',3,'confirmed',false));
 SELECT relay_results INTO saved FROM public.competition_meet_events WHERE competition_id=competition AND name=relay;
 PERFORM set_config('request.jwt.claim.sub',other_actor::text,true);
 BEGIN
  PERFORM public.save_competition_relay_checked(competition,gen_random_uuid(),input||jsonb_build_object('revision',4,'confirmed',false));
  RAISE EXCEPTION 'Nonstaff heat edit accepted';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'meet_forbidden' THEN RAISE; END IF; END;
 IF (SELECT relay_results FROM public.competition_meet_events WHERE competition_id=competition AND name=relay) IS DISTINCT FROM saved
  OR (SELECT count(*) FROM public.competition_meet_requests WHERE competition_id=competition)<>4 THEN RAISE EXCEPTION 'Rejected heat save changed data'; END IF;
END $$;
SELECT jsonb_build_object('multiheat',true,'thirdHeatSameEvent',true,'requestReplay',true,'revisionConflict',true,'preventTruncation',true,'confirmationAndPermissions',true);
