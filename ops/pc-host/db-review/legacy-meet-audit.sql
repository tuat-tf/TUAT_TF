-- Read-only retirement evidence. Run with an already verified database identity
-- in a READ ONLY transaction; no names, account IDs or individual results leave it.
-- A missing row after activation may be an intentional canonical change. Review
-- the aggregate request counts before treating a mismatch as an import failure.
-- Old audit tables must remain: get_competition_meet_history still reads them.
WITH target AS (
  SELECT * FROM public.competition_meets
  WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'
), source_operations AS (
  SELECT o.event_name, person->>'entryId' AS operation_key
  FROM public.ob_event_operations o
  CROSS JOIN LATERAL jsonb_array_elements(o.data->'participants') person
  WHERE o.meet_key='ob-2026'
), source_people AS (
  SELECT id::text AS id FROM public.ob_meet_entries WHERE meet_key='ob-2026'
  UNION
  SELECT split_part(operation_key,':',1) FROM source_operations
), source_appearances AS (
  SELECT e.id::text AS participant_id, counts.event_name,
    e.id::text||CASE WHEN n>1 THEN ':'||n::text ELSE '' END AS operation_key
  FROM public.ob_meet_entries e
  CROSS JOIN LATERAL (
    SELECT event_name,count(*)::integer AS count
    FROM unnest(e.events) event_name GROUP BY event_name
  ) counts
  CROSS JOIN LATERAL generate_series(1,counts.count) n
  WHERE e.meet_key='ob-2026'
  UNION
  SELECT split_part(operation_key,':',1),event_name,operation_key FROM source_operations
), source_duties AS (
  SELECT md5('entry/'||d.meet_key||'/'||d.entry_id::text||'/'||d.slot_time||'/'||d.event_name)::uuid AS id
  FROM public.ob_entry_duties d WHERE meet_key='ob-2026'
  UNION ALL
  SELECT md5('profile/'||d.meet_key||'/'||d.profile_id::text||'/'||d.slot_time||'/'||d.event_name)::uuid
  FROM public.ob_meet_duties d WHERE meet_key='ob-2026'
), legacy_tables(name) AS (
  VALUES ('ob_meet_entries'),('ob_event_operations'),('ob_meet_duties'),
    ('ob_entry_duties'),('ob_duty_roles'),('ob_party_responses')
), request_counts AS (
  SELECT command->>'action' AS action,count(*) AS count
  FROM public.competition_meet_requests
  WHERE competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'
  GROUP BY command->>'action'
)
SELECT jsonb_build_object(
  'version',1,
  'meet',jsonb_build_object(
    'rows',(SELECT count(*) FROM target),
    'ready',coalesce((SELECT ready FROM target),false),
    'source_frozen',coalesce((SELECT source_frozen FROM target),false),
    'expected_legacy_source',coalesce((SELECT legacy_source='ob-2026' FROM target),false),
    'staff_role_present',EXISTS(SELECT 1 FROM target m JOIN public.roles r ON r.id=m.staff_role_id),
    'program_rows',coalesce((SELECT jsonb_array_length(program) FROM target),0)
  ),
  'source',jsonb_build_object(
    'entries',(SELECT count(*) FROM public.ob_meet_entries WHERE meet_key='ob-2026'),
    'participants_including_removed',(SELECT count(*) FROM source_people),
    'appearances',(SELECT count(*) FROM source_appearances),
    'operations',(SELECT count(*) FROM public.ob_event_operations WHERE meet_key='ob-2026'),
    'duties',(SELECT count(*) FROM source_duties),
    'duty_roles',(SELECT count(*) FROM public.ob_duty_roles WHERE meet_key='ob-2026'),
    'party',(SELECT count(*) FROM public.ob_party_responses WHERE meet_key='ob-2026'),
    'entry_history',(SELECT count(*) FROM public.ob_entry_changes WHERE coalesce(after_data->>'meet_key',before_data->>'meet_key')='ob-2026'),
    'operation_history',(SELECT count(*) FROM public.ob_operation_changes WHERE meet_key='ob-2026'),
    'other_meet_entries',(SELECT count(*) FROM public.ob_meet_entries WHERE meet_key<>'ob-2026')
  ),
  'canonical',jsonb_build_object(
    'participants',(SELECT count(*) FROM public.competition_participants WHERE competition_id IN (SELECT competition_id FROM target)),
    'appearances',(SELECT count(*) FROM public.competition_appearances WHERE competition_id IN (SELECT competition_id FROM target)),
    'events',(SELECT count(*) FROM public.competition_meet_events WHERE competition_id IN (SELECT competition_id FROM target)),
    'duties',(SELECT count(*) FROM public.competition_meet_duties WHERE competition_id IN (SELECT competition_id FROM target)),
    'duty_roles',(SELECT count(*) FROM public.competition_meet_duty_roles WHERE competition_id IN (SELECT competition_id FROM target)),
    'party',(SELECT count(*) FROM public.competition_meet_party WHERE competition_id IN (SELECT competition_id FROM target))
  ),
  'missing_source_rows',jsonb_build_object(
    'participants',(SELECT count(*) FROM source_people s WHERE NOT EXISTS (
      SELECT 1 FROM public.competition_participants p WHERE p.competition_id IN (SELECT competition_id FROM target) AND p.id::text=s.id)),
    'helper_profiles',(SELECT count(DISTINCT d.profile_id) FROM public.ob_meet_duties d WHERE d.meet_key='ob-2026' AND NOT EXISTS (
      SELECT 1 FROM public.competition_participants p WHERE p.competition_id IN (SELECT competition_id FROM target) AND p.profile_id=d.profile_id)),
    'appearances',(SELECT count(*) FROM source_appearances s WHERE NOT EXISTS (
      SELECT 1 FROM public.competition_appearances a WHERE a.competition_id IN (SELECT competition_id FROM target)
        AND a.participant_id::text=s.participant_id AND a.event_name=s.event_name AND a.operation_key=s.operation_key)),
    'duties',(SELECT count(*) FROM source_duties s WHERE NOT EXISTS (
      SELECT 1 FROM public.competition_meet_duties d WHERE d.competition_id IN (SELECT competition_id FROM target) AND d.id=s.id)),
    'duty_roles',(SELECT count(*) FROM public.ob_duty_roles s WHERE s.meet_key='ob-2026' AND NOT EXISTS (
      SELECT 1 FROM public.competition_meet_duty_roles r WHERE r.competition_id IN (SELECT competition_id FROM target) AND r.id=s.id)),
    'party',(SELECT count(*) FROM public.ob_party_responses s WHERE s.meet_key='ob-2026' AND NOT EXISTS (
      SELECT 1 FROM public.competition_meet_party p WHERE p.competition_id IN (SELECT competition_id FROM target) AND p.id=s.id))
  ),
  'legacy_write_guards',jsonb_build_object(
    'expected',6,
    'enabled',(SELECT count(*) FROM legacy_tables l JOIN pg_catalog.pg_namespace n ON n.nspname='public'
      JOIN pg_catalog.pg_class c ON c.relnamespace=n.oid AND c.relname=l.name
      JOIN pg_catalog.pg_trigger t ON t.tgrelid=c.oid AND t.tgname='aa_meet_migrated_readonly'
      JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
      WHERE NOT t.tgisinternal AND t.tgenabled IN ('O','A') AND p.proname='reject_migrated_ob_write')
  ),
  'pending_legacy_changes',(SELECT count(*) FROM public.failover_changes
    WHERE table_name IN (SELECT name FROM legacy_tables)
      OR table_name IN ('ob_entry_changes','ob_operation_changes')),
  'canonical_requests_by_action',coalesce((SELECT jsonb_object_agg(action,count) FROM request_counts WHERE action IS NOT NULL),'{}'::jsonb)
) AS legacy_meet_audit;
