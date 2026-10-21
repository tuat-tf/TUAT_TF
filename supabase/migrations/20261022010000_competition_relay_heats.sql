-- A relay is one event with ordered heats, each containing lanes 1 through 6.
-- Legacy rows without a heat remain heat 1, including in pending request ledgers.
CREATE OR REPLACE FUNCTION public.competition_relay_results_valid(teams jsonb,confirmed boolean) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE team jsonb; n integer:=0; entered integer:=0; name text; time text; heat integer;
BEGIN
 IF teams IS NULL OR jsonb_typeof(teams)<>'array' OR confirmed IS NULL THEN RETURN false; END IF;
 IF jsonb_array_length(teams)=0 OR jsonb_array_length(teams)%6<>0 THEN RETURN false; END IF;
 FOR team IN SELECT value FROM jsonb_array_elements(teams) LOOP
  heat:=n/6+1;
  IF jsonb_typeof(team)<>'object' OR jsonb_typeof(team->'lane') IS DISTINCT FROM 'number' OR team->>'lane'<>(n%6+1)::text THEN RETURN false; END IF;
  IF (team ? 'heat' AND (jsonb_typeof(team->'heat') IS DISTINCT FROM 'number' OR team->>'heat'<>heat::text))
   OR (NOT team ? 'heat' AND heat<>1)
   OR jsonb_typeof(team->'name') IS DISTINCT FROM 'string' OR jsonb_typeof(team->'time') IS DISTINCT FROM 'string'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(team) k WHERE k NOT IN ('heat','lane','name','time','members')) THEN RETURN false; END IF;
  n:=n+1;
  IF jsonb_typeof(team->'members') IS DISTINCT FROM 'array' THEN RETURN false; END IF;
  IF jsonb_array_length(team->'members')<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(team->'members') member WHERE jsonb_typeof(member)<>'string' OR length(member#>>'{}')>100) THEN RETURN false; END IF;
  name:=btrim(team->>'name');time:=team->>'time';
  IF name='' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(team->'members') member WHERE btrim(member)<>'') THEN RETURN false; END IF;
  IF length(team->>'name')>100 THEN RETURN false; END IF;
  IF name<>'' THEN entered:=entered+1; END IF;
  IF time<>'' AND (name='' OR NOT public.competition_meet_trial_valid(jsonb_build_object('mark',time,'wind','','status','valid'),'track',false)) THEN RETURN false; END IF;
  IF confirmed AND name<>'' AND time='' THEN RETURN false; END IF;
 END LOOP;
 RETURN NOT confirmed OR entered>0;
END $$;
REVOKE ALL ON FUNCTION public.competition_relay_results_valid(jsonb,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.competition_relay_results_valid(jsonb,boolean) TO authenticated,service_role;

-- Keep the existing authorization, event revision, immutable request ID and
-- backend fence. A stale six-lane client must not truncate saved later heats.
CREATE OR REPLACE FUNCTION public.save_competition_relay_checked(p_competition_id text,p_request_id uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous public.competition_meet_requests%ROWTYPE; event public.competition_meet_events%ROWTYPE; rights jsonb; teams jsonb; desired_confirmed boolean; result jsonb; after_value jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved)
  OR p_request_id IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR p_command->>'action' IS DISTINCT FROM 'relay.save' OR pg_column_size(p_command)>250000
 THEN RAISE EXCEPTION 'meet_forbidden' USING ERRCODE='42501'; END IF;
 IF p_command->>'backend' IS NOT NULL AND p_command->>'backend' IS DISTINCT FROM
  (CASE WHEN coalesce((SELECT log_changes FROM public.failover_config WHERE id),false) THEN 'cloud' ELSE 'pc' END)
 THEN RAISE EXCEPTION 'meet_backend_changed'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('meet/'||p_competition_id,0));
 rights:=public.competition_meet_permissions(p_competition_id);
 IF NOT coalesce((rights->>'record')::boolean,false) THEN RAISE EXCEPTION 'meet_forbidden' USING ERRCODE='42501'; END IF;
 SELECT * INTO previous FROM public.competition_meet_requests WHERE id=p_request_id;
 IF FOUND THEN
  IF previous.actor_id IS DISTINCT FROM auth.uid() OR previous.competition_id IS DISTINCT FROM p_competition_id OR previous.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'meet_request'; END IF;
  RETURN previous.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=p_competition_id AND ready) THEN RAISE EXCEPTION 'meet_pending'; END IF;
 SELECT * INTO event FROM public.competition_meet_events WHERE competition_id=p_competition_id AND name=p_command->>'event' FOR UPDATE;
 IF NOT FOUND OR event.relay_results IS NULL THEN RAISE EXCEPTION 'meet_relay_team'; END IF;
 IF event.revision IS DISTINCT FROM (p_command->>'revision')::integer THEN RAISE EXCEPTION 'meet_conflict'; END IF;
 IF jsonb_typeof(p_command->'confirmed') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'meet_relay_invalid'; END IF;
 teams:=p_command->'relayResults';desired_confirmed:=(p_command->>'confirmed')::boolean;
 IF event.confirmed AND teams IS DISTINCT FROM event.relay_results THEN RAISE EXCEPTION 'meet_confirmed'; END IF;
 IF NOT public.competition_relay_results_valid(teams,desired_confirmed) THEN RAISE EXCEPTION 'meet_relay_invalid'; END IF;
 IF jsonb_array_length(teams)<jsonb_array_length(event.relay_results) THEN RAISE EXCEPTION 'meet_relay_invalid'; END IF;
 IF desired_confirmed IS DISTINCT FROM event.confirmed AND NOT coalesce((rights->>'groups')::boolean,false) THEN RAISE EXCEPTION 'meet_forbidden' USING ERRCODE='42501'; END IF;
 UPDATE public.competition_meet_events SET relay_results=teams,confirmed=desired_confirmed,revision=revision+1
 WHERE competition_id=p_competition_id AND name=event.name RETURNING to_jsonb(competition_meet_events) INTO after_value;
 result:=jsonb_build_object('requestId',p_request_id,'id',event.name);
 INSERT INTO public.competition_meet_requests(id,competition_id,actor_id,actor_name,command,result,before_data,after_data)
 VALUES(p_request_id,p_competition_id,auth.uid(),(SELECT display_name FROM public.profiles WHERE id=auth.uid()),p_command,result,to_jsonb(event),after_value);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.save_competition_relay_checked(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_competition_relay_checked(text,uuid,jsonb) TO authenticated;

-- Repair only the exact OB event introduced by 20261021010100. Preserve both
-- original rows (including confirmation and start time) in the existing private
-- meet history before removing the duplicate event. Never rewrite old requests.
DO $$
DECLARE competition text:='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'; relay text:='4×300mリレー'; duplicate text:='4×300mリレー 2組目';
 request uuid:='438bf967-7a44-473a-a4b5-9027dc76c5af'; first_race public.competition_meet_events%ROWTYPE; second_race public.competition_meet_events%ROWTYPE;
 combined jsonb; after_value jsonb; prior_claims text; prior_role text; affected integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('meet/'||competition,0));
 IF NOT EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=competition AND meet_key='ob-2026' AND legacy_source='ob-2026' AND ready) THEN RAISE EXCEPTION 'meet_relay_migration_target'; END IF;
 SELECT * INTO first_race FROM public.competition_meet_events WHERE competition_id=competition AND name=relay FOR UPDATE;
 IF NOT FOUND OR first_race.relay_results IS NULL THEN RAISE EXCEPTION 'meet_relay_first_heat_missing'; END IF;
 SELECT * INTO second_race FROM public.competition_meet_events WHERE competition_id=competition AND name=duplicate FOR UPDATE;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM public.competition_meet_requests WHERE id=request AND competition_id=competition AND command->>'action'='relay.heats.merge') AND jsonb_array_length(first_race.relay_results)>=12 THEN RETURN; END IF;
  RAISE EXCEPTION 'meet_relay_second_heat_missing';
 END IF;
 IF EXISTS(SELECT 1 FROM public.competition_meet_requests WHERE id=request)
  OR jsonb_array_length(first_race.relay_results)<>6 OR second_race.relay_results IS NULL OR jsonb_array_length(second_race.relay_results)<>6
  OR NOT public.competition_relay_results_valid(first_race.relay_results,first_race.confirmed)
  OR NOT public.competition_relay_results_valid(second_race.relay_results,second_race.confirmed) THEN RAISE EXCEPTION 'meet_relay_migration_conflict'; END IF;
 IF EXISTS(SELECT 1 FROM public.competition_appearances WHERE competition_id=competition AND event_name=duplicate)
  OR EXISTS(SELECT 1 FROM public.competition_meet_duties WHERE competition_id=competition AND event_name=duplicate)
  OR EXISTS(SELECT 1 FROM public.competition_meet_duty_roles WHERE competition_id=competition AND event_name=duplicate)
  OR EXISTS(SELECT 1 FROM public.competition_meets m CROSS JOIN LATERAL jsonb_array_elements(m.program) slot WHERE m.competition_id=competition AND slot->'events' ? duplicate)
 THEN RAISE EXCEPTION 'meet_relay_duplicate_dependencies'; END IF;
 SELECT first_race.relay_results||jsonb_agg(value||jsonb_build_object('heat',2) ORDER BY ordinal)
 INTO combined FROM jsonb_array_elements(second_race.relay_results) WITH ORDINALITY AS source(value,ordinal);
 UPDATE public.competition_meet_events SET relay_results=combined,confirmed=first_race.confirmed AND second_race.confirmed,revision=revision+1
 WHERE competition_id=competition AND name=relay RETURNING to_jsonb(competition_meet_events) INTO after_value;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'meet_relay_migration_count'; END IF;
 -- Migration bookkeeping runs without an end-user actor, like existing import
 -- journals. Scope the existing service-role trigger exemption to this insert.
 prior_claims:=current_setting('request.jwt.claims',true);prior_role:=current_setting('request.jwt.claim.role',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 PERFORM set_config('request.jwt.claim.role','service_role',true);
 INSERT INTO public.competition_meet_requests(id,competition_id,actor_id,actor_name,command,result,before_data,after_data)
 VALUES(request,competition,NULL,'種目整理',jsonb_build_object('action','relay.heats.merge','event',relay,'sourceEvent',duplicate),jsonb_build_object('requestId',request,'id',relay),
  jsonb_build_object('events',jsonb_build_array(to_jsonb(first_race),to_jsonb(second_race))),after_value);
 PERFORM set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 PERFORM set_config('request.jwt.claim.role',coalesce(prior_role,''),true);
 DELETE FROM public.competition_meet_events WHERE competition_id=competition AND name=duplicate;
 GET DIAGNOSTICS affected=ROW_COUNT;
 IF affected<>1 THEN RAISE EXCEPTION 'meet_relay_migration_count'; END IF;
END $$;
NOTIFY pgrst,'reload schema';
