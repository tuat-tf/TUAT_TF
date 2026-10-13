-- Copy the legacy capabilities once; later renames and migration retries never grant them.
-- Assignments, existing permission flags, meet staff IDs and protected-role guards stay intact.
DO $$
DECLARE
  initialize_capabilities boolean;
  previous_headers text := current_setting('request.headers', true);
  previous_claims text := current_setting('request.jwt.claims', true);
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roles' AND column_name='can_moderate_comments'
  ) INTO initialize_capabilities;

  IF initialize_capabilities AND EXISTS (
    SELECT 1 FROM public.competition_meets m JOIN public.roles r ON r.id=m.staff_role_id
    WHERE m.legacy_source='ob-2026' AND r.is_everyone
  ) THEN
    RAISE EXCEPTION 'OB staff must use a role other than everyone before capability migration';
  END IF;

  ALTER TABLE public.roles
    ADD COLUMN IF NOT EXISTS can_moderate_comments boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_ob_meet boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS editable_menu_blocks text[] NOT NULL DEFAULT '{}';

  IF initialize_capabilities THEN
    -- The initial copy is a migration, not a caller's role-management operation.
    -- Mirror mode preserves the existing statement lock and suppresses replay side effects.
    PERFORM set_config('request.headers','{"x-tuat-mirror":"1"}',true);
    PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
    UPDATE public.roles SET
      can_moderate_comments = name='管理者',
      -- Preserve both legacy named staff and the current configured OB staff.
      can_manage_ob_meet = name='OB戦2026' OR EXISTS (
        SELECT 1 FROM public.competition_meets m WHERE m.legacy_source='ob-2026' AND m.staff_role_id=roles.id
      ),
      editable_menu_blocks = CASE
        WHEN name IN ('中距離ブロック長','長距離ブロック長') THEN ARRAY['middle_long']
        WHEN name IN ('短距離ブロック長','投擲ブロック長','跳躍ブロック長') THEN ARRAY['short']
        ELSE '{}'::text[] END
    WHERE NOT is_everyone;
    PERFORM set_config('request.headers',coalesce(nullif(previous_headers,''),'{}'),true);
    PERFORM set_config('request.jwt.claims',coalesce(nullif(previous_claims,''),'{}'),true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.roles'::regclass AND conname='roles_editable_menu_blocks_valid') THEN
    ALTER TABLE public.roles ADD CONSTRAINT roles_editable_menu_blocks_valid CHECK (
      editable_menu_blocks <@ ARRAY['short','middle_long']::text[]
      AND array_position(editable_menu_blocks,NULL) IS NULL
    );
  END IF;
  ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS roles_everyone_capabilities_restricted;
  ALTER TABLE public.roles ADD CONSTRAINT roles_everyone_capabilities_restricted CHECK (
    NOT is_everyone OR (NOT can_manage_system AND NOT can_manage_members
      AND NOT can_moderate_comments AND NOT can_manage_ob_meet AND cardinality(editable_menu_blocks)=0)
  );
END $$;

CREATE OR REPLACE FUNCTION public.can_moderate_comments() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profile_roles pr JOIN public.roles r ON r.id=pr.role_id
    WHERE pr.profile_id=auth.uid() AND NOT r.is_everyone AND r.can_moderate_comments
  )
$$;
REVOKE ALL ON FUNCTION public.can_moderate_comments() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_moderate_comments() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_ob_meet() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profile_roles pr JOIN public.roles r ON r.id=pr.role_id
    WHERE pr.profile_id=auth.uid() AND NOT r.is_everyone AND r.can_manage_ob_meet
  )
$$;
REVOKE ALL ON FUNCTION public.can_manage_ob_meet() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_ob_meet() TO authenticated;

CREATE OR REPLACE FUNCTION public.can_edit_block_menu(target_block text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT auth.uid() IS NOT NULL AND public.can_create_menu() AND EXISTS (
    SELECT 1 FROM public.profile_roles pr JOIN public.roles r ON r.id=pr.role_id
    WHERE pr.profile_id=auth.uid() AND NOT r.is_everyone
      AND CASE WHEN target_block IN ('short','jump','throw') THEN 'short'
        WHEN target_block='middle_long' THEN 'middle_long' ELSE NULL END = ANY(r.editable_menu_blocks)
  )
$$;
REVOKE ALL ON FUNCTION public.can_edit_block_menu(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_edit_block_menu(text) TO authenticated;

-- Kept for compatibility; current policies no longer call the legacy profile-role helper.
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.can_manage_members() OR public.can_create_menu()
$$;
REVOKE ALL ON FUNCTION public.is_staff() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_everyone_role() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF public.is_mirror_write() THEN RETURN NEW; END IF;
  IF NEW.is_everyone AND (NEW.can_manage_system OR NEW.can_manage_members
    OR NEW.can_moderate_comments OR NEW.can_manage_ob_meet OR cardinality(NEW.editable_menu_blocks)>0) THEN
    RAISE EXCEPTION 'everyone role cannot grant administrative permissions';
  END IF;
  IF TG_OP='UPDATE' AND OLD.is_everyone AND NOT NEW.is_everyone THEN
    RAISE EXCEPTION 'everyone role cannot be converted';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_everyone_role() FROM PUBLIC,anon,authenticated;

-- OB uses the configured capability across roles; other meets retain their role-ID scope.
-- Keep the current system-only configuration and OB record/register/history boundaries.
CREATE OR REPLACE FUNCTION public.competition_meet_permissions(p_competition_id text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH flags AS (SELECT
  CASE WHEN EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=p_competition_id AND legacy_source='ob-2026')
    THEN public.can_manage_ob_meet()
    ELSE EXISTS(SELECT 1 FROM public.competition_meets m JOIN public.roles r ON r.id=m.staff_role_id
      WHERE m.competition_id=p_competition_id AND (r.is_everyone OR EXISTS(
        SELECT 1 FROM public.profile_roles pr WHERE pr.role_id=r.id AND pr.profile_id=auth.uid()))) END staff,
  public.can_manage_system() system,
  EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved) registrant,
  EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND approved AND status='active') member,
  EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=p_competition_id AND legacy_source='ob-2026') legacy)
 SELECT jsonb_build_object(
  'manage',registrant AND (staff OR (system AND NOT legacy)),
  'groups',registrant AND (staff OR (system AND NOT legacy)),
  'record',registrant AND (staff OR (NOT legacy AND (system OR member))),
  'register',registrant AND (NOT legacy OR staff),
  'configure',registrant AND system,
  'history',registrant AND (staff OR (NOT legacy AND (system OR public.can_manage_members())))) FROM flags
$$;
REVOKE ALL ON FUNCTION public.competition_meet_permissions(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.competition_meet_permissions(text) TO authenticated;

-- Imported staff keeps its stored ID; role labels no longer change the source digest.
CREATE OR REPLACE FUNCTION public.competition_meet_source_digest() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT md5(jsonb_build_object('ob_meet_entries',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_meet_entries row),'ob_event_operations',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_event_operations row),'ob_meet_duties',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_meet_duties row),'ob_entry_duties',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_entry_duties row),'ob_duty_roles',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_duty_roles row),'ob_party_responses',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_party_responses row),'ob_entry_changes',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_entry_changes row),'ob_operation_changes',(SELECT coalesce(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text),'[]'::jsonb) FROM public.ob_operation_changes row),'helperProfiles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'display_name',p.display_name,'grade',p.grade) ORDER BY p.id),'[]'::jsonb) FROM public.profiles p WHERE EXISTS(SELECT 1 FROM public.ob_meet_duties d WHERE d.profile_id=p.id)),'staffRole',(SELECT staff_role_id FROM public.competition_meets WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'))::text)
$$;
REVOKE ALL ON FUNCTION public.competition_meet_source_digest() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.competition_meet_source_digest() TO service_role;

-- A first import requires unambiguous configured staff, and never replaces a stored staff ID.
CREATE OR REPLACE FUNCTION public.refresh_competition_meet_import(p_activate boolean,p_expected_digest text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE competition text:='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'; headers text; claims text;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('meet/'||competition,0));
 IF EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=competition AND ready) THEN RETURN jsonb_build_object('alreadyReady',true); END IF;
 LOCK TABLE public.ob_meet_entries,public.ob_event_operations,public.ob_meet_duties,public.ob_entry_duties,public.ob_duty_roles,public.ob_party_responses,public.ob_entry_changes,public.ob_operation_changes IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.profiles,public.roles IN SHARE MODE;
 IF p_activate AND (p_expected_digest IS NULL OR public.competition_meet_source_digest() IS DISTINCT FROM p_expected_digest) THEN RAISE EXCEPTION 'meet_source_changed'; END IF;
 IF p_activate AND NOT EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=competition AND source_frozen) THEN RAISE EXCEPTION 'meet_source_not_frozen'; END IF;
 IF p_activate AND EXISTS(SELECT 1 FROM public.failover_changes WHERE table_name IN ('ob_meet_entries','ob_event_operations','ob_meet_duties','ob_entry_duties','ob_duty_roles','ob_party_responses','ob_entry_changes','ob_operation_changes')) THEN RAISE EXCEPTION 'meet_pending_replay'; END IF;
 IF EXISTS(SELECT 1 FROM public.competition_meet_requests WHERE competition_id=competition) THEN RAISE EXCEPTION 'meet_import_has_requests'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.competition_meets WHERE competition_id=competition)
   AND (SELECT count(*) FROM public.roles WHERE can_manage_ob_meet AND NOT is_everyone)<>1
 THEN RAISE EXCEPTION 'meet_staff_configuration_required'; END IF;
 headers:=current_setting('request.headers',true);claims:=current_setting('request.jwt.claims',true);
 -- Bootstrap rows are a copy of the source, not new failover writes.
 PERFORM set_config('request.headers','{"x-tuat-mirror":"1"}',true);
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 DELETE FROM public.competition_meet_party WHERE competition_id=competition;
 DELETE FROM public.competition_meet_duties WHERE competition_id=competition;
 DELETE FROM public.competition_meet_duty_roles WHERE competition_id=competition;
 DELETE FROM public.competition_appearances WHERE competition_id=competition;
 DELETE FROM public.competition_participants WHERE competition_id=competition;
 DELETE FROM public.competition_meet_events WHERE competition_id=competition;
-- Idempotent import: existing canonical changes are never overwritten on a second run.
INSERT INTO public.competition_meets(competition_id,meet_key,staff_role_id,legacy_source)
SELECT c.id,'ob-2026',(SELECT id FROM public.roles WHERE can_manage_ob_meet AND NOT is_everyone ORDER BY id LIMIT 1),'ob-2026'
FROM public.competitions c WHERE c.id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' ON CONFLICT DO NOTHING;
UPDATE public.competition_meets SET program='[{"time":"09:00","label":"受付開始","events":[]},{"time":"09:30","label":"開会式","events":[]},{"time":"10:00","label":"1500m","events":["1500m"]},{"time":"10:30","label":"ジャベリックスロー・立ち五段跳び","events":["ジャベリックスロー","立ち五段"]},{"time":"11:00","label":"100m・砲丸投げ","events":["100m","砲丸投げ"]},{"time":"11:40","label":"300mH","events":["300mH"]},{"time":"12:20","label":"OB・OG総会","events":[]},{"time":"13:00","label":"走り高跳び","events":["走り高跳び"]},{"time":"13:30","label":"300m","events":["300m"]},{"time":"14:30","label":"やり投げ・走り幅跳び","events":["やり投げ","走り幅跳び"]},{"time":"15:00","label":"3000m","events":["3000m"]},{"time":"15:30","label":"4×300mリレー","events":[],"note":"当日エントリー"},{"time":"16:00","label":"閉会式","events":[]}]',party_info='{"time":"19:00〜","venue":"ミライザカ 府中並木通り店","fee":3500}' WHERE legacy_source='ob-2026' AND NOT ready AND program='[]'::jsonb;
INSERT INTO public.competition_meet_events(competition_id,name,family,division,starts_at,sort_order,discipline,wind,capacity)
SELECT m.competition_id,division||family,family,division,starts_at,n,
 CASE WHEN family IN ('100m','300m','300mH','1500m','3000m') THEN 'track' WHEN family='走り高跳び' THEN 'height' ELSE 'distance' END,
 family IN ('100m','走り幅跳び'),CASE WHEN family='100m' THEN 8 WHEN family IN ('300m','300mH') THEN 6 ELSE NULL END
FROM public.competition_meets m CROSS JOIN (VALUES
 ('1500m','10:00',1),('ジャベリックスロー','10:30',2),('立ち五段','10:30',3),('100m','11:00',4),('砲丸投げ','11:00',5),('300mH','11:40',6),('走り高跳び','13:00',7),('300m','13:30',8),('やり投げ','14:30',9),('走り幅跳び','14:30',10),('3000m','15:00',11)) slots(family,starts_at,n)
CROSS JOIN (VALUES('男子'),('女子')) divisions(division) WHERE m.legacy_source='ob-2026' AND NOT m.ready ON CONFLICT DO NOTHING;
INSERT INTO public.competition_participants(id,competition_id,profile_id,name,grade,absent,revision,legacy_data)
SELECT e.id,m.competition_id,e.profile_id,e.submitted_name,e.grade,e.absent,e.revision,to_jsonb(e)
FROM public.ob_meet_entries e JOIN public.competition_meets m ON m.legacy_source=e.meet_key AND NOT m.ready ON CONFLICT DO NOTHING;
-- Preserve orphaned saved results, even if their former registration was removed.
INSERT INTO public.competition_participants(id,competition_id,name,grade,deleted,legacy_data)
SELECT DISTINCT split_part(person->>'entryId',':',1)::uuid,m.competition_id,
 coalesce(history.data->>'submitted_name','登録解除済み'),coalesce(history.data->>'grade','不明'),true,history.data
FROM public.ob_event_operations o JOIN public.competition_meets m ON m.legacy_source=o.meet_key AND NOT m.ready
CROSS JOIN LATERAL jsonb_array_elements(o.data->'participants') person
LEFT JOIN LATERAL (SELECT coalesce(h.before_data,h.after_data) data FROM public.ob_entry_changes h
 WHERE coalesce(h.before_data->>'id',h.after_data->>'id')=split_part(person->>'entryId',':',1) ORDER BY h.changed_at DESC,h.id DESC LIMIT 1) history ON true
ON CONFLICT DO NOTHING;
-- Helpers without a race registration are participants too; account IDs are never guessed from names.
INSERT INTO public.competition_participants(id,competition_id,profile_id,name,grade)
SELECT md5(m.competition_id::text||'/helper/'||p.id::text)::uuid,m.competition_id,p.id,p.display_name,coalesce(p.grade,'')
FROM public.profiles p JOIN public.ob_meet_duties d ON d.profile_id=p.id JOIN public.competition_meets m ON m.legacy_source=d.meet_key AND NOT m.ready
WHERE NOT EXISTS(SELECT 1 FROM public.competition_participants person WHERE person.competition_id=m.competition_id AND person.profile_id=p.id) ON CONFLICT DO NOTHING;
WITH sources AS (
 SELECT m.competition_id,e.id participant_id,event_name,e.id::text||CASE WHEN n>1 THEN ':'||n::text ELSE '' END operation_key,n ordinal,e.qualification_marks->>event_name mark,true registered
 FROM public.ob_meet_entries e JOIN public.competition_meets m ON m.legacy_source=e.meet_key AND NOT m.ready CROSS JOIN LATERAL (SELECT event_name,count(*)::integer count FROM unnest(e.events) event_name GROUP BY event_name) counts CROSS JOIN LATERAL generate_series(1,counts.count) n
 UNION
 SELECT m.competition_id,split_part(p->>'entryId',':',1)::uuid,o.event_name,p->>'entryId',coalesce(nullif(split_part(p->>'entryId',':',2),'')::integer,1),NULL,false
 FROM public.ob_event_operations o JOIN public.competition_meets m ON m.legacy_source=o.meet_key AND NOT m.ready CROSS JOIN LATERAL jsonb_array_elements(o.data->'participants') p
), dedup AS (SELECT competition_id,participant_id,event_name,operation_key,max(ordinal) ordinal,max(mark) mark,bool_or(registered) registered FROM sources GROUP BY 1,2,3,4)
INSERT INTO public.competition_appearances(id,competition_id,participant_id,event_name,ordinal,operation_key,qualification_mark,state,performance)
SELECT md5(s.competition_id::text||'/'||s.event_name||'/'||s.operation_key)::uuid,s.competition_id,s.participant_id,s.event_name,s.ordinal,s.operation_key,s.mark,CASE WHEN s.registered THEN 'registered' ELSE 'cancelled' END,
 coalesce((SELECT value FROM public.ob_event_operations o CROSS JOIN LATERAL jsonb_array_elements(o.data->'participants') WHERE o.meet_key='ob-2026' AND o.event_name=s.event_name AND value->>'entryId'=s.operation_key),jsonb_build_object('group',NULL,'order',NULL,'status','entered','trials','[]'::jsonb))||jsonb_build_object('entryId',md5(s.competition_id::text||'/'||s.event_name||'/'||s.operation_key)::uuid)
FROM dedup s JOIN public.competition_participants p ON p.id=s.participant_id JOIN public.competition_meet_events e ON e.competition_id=s.competition_id AND e.name=s.event_name ON CONFLICT DO NOTHING;
UPDATE public.competition_meet_events e SET confirmed=(o.data->>'confirmed')::boolean,revision=o.revision
FROM public.ob_event_operations o JOIN public.competition_meets m ON m.legacy_source=o.meet_key AND NOT m.ready
WHERE e.competition_id=m.competition_id AND e.name=o.event_name AND e.revision=0;
INSERT INTO public.competition_meet_duty_roles(id,competition_id,slot_time,event_name,name,required_count,revision,abbreviation)
SELECT r.id,m.competition_id,r.slot_time,CASE r.event_name WHEN '立ち五段跳び' THEN '立ち五段' ELSE r.event_name END,r.name,r.required_count,r.revision,r.abbreviation FROM public.ob_duty_roles r JOIN public.competition_meets m ON m.legacy_source=r.meet_key AND NOT m.ready ON CONFLICT DO NOTHING;
INSERT INTO public.competition_meet_duties(id,competition_id,participant_id,slot_time,event_name,assignment,role_ids,revision,source)
SELECT md5('entry/'||d.meet_key||'/'||d.entry_id::text||'/'||d.slot_time||'/'||d.event_name)::uuid,m.competition_id,d.entry_id,d.slot_time,CASE d.event_name WHEN '立ち五段跳び' THEN '立ち五段' ELSE d.event_name END,d.assignment,d.role_ids,d.revision,'entry'
FROM public.ob_entry_duties d JOIN public.competition_meets m ON m.legacy_source=d.meet_key AND NOT m.ready ON CONFLICT DO NOTHING;
INSERT INTO public.competition_meet_duties(id,competition_id,participant_id,slot_time,event_name,assignment,role_ids,revision,source)
SELECT md5('profile/'||d.meet_key||'/'||d.profile_id::text||'/'||d.slot_time||'/'||d.event_name)::uuid,m.competition_id,p.id,d.slot_time,CASE d.event_name WHEN '立ち五段跳び' THEN '立ち五段' ELSE d.event_name END,d.assignment,d.role_ids,d.revision,'profile'
FROM public.ob_meet_duties d JOIN public.competition_meets m ON m.legacy_source=d.meet_key AND NOT m.ready JOIN public.competition_participants p ON p.competition_id=m.competition_id AND p.profile_id=d.profile_id ON CONFLICT DO NOTHING;
INSERT INTO public.competition_meet_party(id,competition_id,participant_id,name,group_label,status,needs_review,revision)
SELECT r.id,m.competition_id,r.entry_id,r.submitted_name,r.group_label,r.status,r.needs_review,r.revision FROM public.ob_party_responses r JOIN public.competition_meets m ON m.legacy_source=r.meet_key AND NOT m.ready ON CONFLICT DO NOTHING;


 IF p_activate THEN UPDATE public.competition_meets SET ready=true WHERE competition_id=competition; END IF;
 PERFORM set_config('request.headers',coalesce(nullif(headers,''),'{}'),true);
 PERFORM set_config('request.jwt.claims',coalesce(nullif(claims,''),'{}'),true);
 RETURN jsonb_build_object('ready',p_activate,'participants',(SELECT count(*) FROM public.competition_participants WHERE competition_id=competition),'appearances',(SELECT count(*) FROM public.competition_appearances WHERE competition_id=competition));
END $$;
REVOKE ALL ON FUNCTION public.refresh_competition_meet_import(boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_competition_meet_import(boolean,text) TO service_role;


-- Editing a role may not remove the final member-management capability.
-- Preserve the existing statement lock, identity checks, mirror path and system invariants.
CREATE OR REPLACE FUNCTION public.guard_system_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  service_write boolean := COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  IF TG_LEVEL = 'STATEMENT' THEN
    PERFORM pg_advisory_xact_lock(74291, 1);
    RETURN NULL;
  END IF;

  IF public.is_mirror_write() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  -- Recheck after the statement lock, including a request whose RLS snapshot
  -- predates another transaction's removal of the caller's management role.
  IF NOT service_write AND NOT public.can_manage_members() THEN
    RAISE EXCEPTION 'member management permission required' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.is_system OR NEW.is_everyone THEN
      RAISE EXCEPTION 'protected roles cannot be created by this operation' USING ERRCODE = '42501';
    END IF;
    IF NEW.can_manage_system AND NOT service_write AND NOT public.can_manage_system() THEN
      RAISE EXCEPTION 'system management permission required' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.is_system IS DISTINCT FROM OLD.is_system
       OR NEW.is_everyone IS DISTINCT FROM OLD.is_everyone THEN
      RAISE EXCEPTION 'role protection cannot be changed' USING ERRCODE = '42501';
    END IF;
    IF OLD.can_manage_members AND NOT NEW.can_manage_members AND NOT EXISTS (
      SELECT 1 FROM public.profile_roles pr JOIN public.roles r ON r.id=pr.role_id
      WHERE r.can_manage_members AND r.id<>OLD.id
    ) THEN
      RAISE EXCEPTION 'cannot remove the last member manager role';
    END IF;
    IF NEW.can_manage_system IS NOT DISTINCT FROM OLD.can_manage_system THEN RETURN NEW; END IF;
  ELSE
    IF OLD.is_system OR OLD.is_everyone THEN
      RAISE EXCEPTION 'protected roles cannot be deleted' USING ERRCODE = '42501';
    END IF;
    IF OLD.can_manage_members AND NOT EXISTS (
      SELECT 1 FROM public.profile_roles pr JOIN public.roles r ON r.id = pr.role_id
      WHERE r.can_manage_members AND r.id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'cannot remove the last member manager role';
    END IF;
    IF NOT OLD.can_manage_system THEN RETURN OLD; END IF;
  END IF;

  IF NOT service_write AND NOT public.can_manage_system() THEN
    RAISE EXCEPTION 'system management permission required' USING ERRCODE = '42501';
  END IF;
  IF OLD.can_manage_system AND NOT EXISTS (
    SELECT 1 FROM public.profile_roles pr JOIN public.roles r ON r.id = pr.role_id
    WHERE r.can_manage_system AND r.id <> OLD.id
  ) THEN
    RAISE EXCEPTION 'cannot remove the last system manager role';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_system_permission_change() FROM PUBLIC,anon,authenticated;
