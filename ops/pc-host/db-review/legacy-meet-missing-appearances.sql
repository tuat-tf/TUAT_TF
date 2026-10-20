-- Read-only follow-up to legacy-meet-audit.sql. Counts only: no names, IDs,
-- event names, source JSON or individual performance values are returned.
-- appearance.delete is a soft delete and cannot explain a missing physical ID.
WITH source_appearances AS (
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
  SELECT split_part(person->>'entryId',':',1),o.event_name,person->>'entryId'
  FROM public.ob_event_operations o
  CROSS JOIN LATERAL jsonb_array_elements(o.data->'participants') person
  WHERE o.meet_key='ob-2026'
), missing AS (
  SELECT s.*,md5('3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5/'||s.event_name||'/'||s.operation_key)::uuid AS imported_id
  FROM source_appearances s WHERE NOT EXISTS (
    SELECT 1 FROM public.competition_appearances a
    WHERE a.competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'
      AND a.participant_id::text=s.participant_id AND a.event_name=s.event_name AND a.operation_key=s.operation_key
  )
), traced AS (
  SELECT s.*,a.id AS current_id,a.participant_id AS current_participant_id,a.event_name AS current_event,
    a.operation_key AS current_key,a.state,a.performance,a.revision,
    q.id AS move_id,q.before_data,q.after_data,
    (SELECT count(*) FROM public.competition_meet_requests r
      WHERE r.competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'
        AND r.command->>'action'='appearance.moveDivision' AND r.command->>'id'=s.imported_id::text) AS move_count
  FROM missing s
  LEFT JOIN public.competition_appearances a ON a.competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND a.id=s.imported_id
  LEFT JOIN LATERAL (
    SELECT r.id,r.before_data,r.after_data
    FROM public.competition_meet_requests r
    WHERE r.competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5'
      AND r.command->>'action'='appearance.moveDivision' AND r.command->>'id'=s.imported_id::text
    ORDER BY r.changed_at DESC,r.id DESC LIMIT 1
  ) q ON true
), classified AS (
  SELECT *,
    current_id IS NOT NULL AND current_participant_id::text=participant_id
      AND move_count=1 AND move_id IS NOT NULL
      AND before_data->>'id'=imported_id::text AND after_data->>'id'=imported_id::text
      AND before_data->>'participant_id'=participant_id AND after_data->>'participant_id'=participant_id
      AND before_data->>'event_name'=event_name AND before_data->>'operation_key'=operation_key
      AND after_data->>'event_name'=current_event AND after_data->>'operation_key'=current_key
      AND (before_data->'performance'->'trials') IS NOT DISTINCT FROM (after_data->'performance'->'trials')
      AS explained_by_one_preserving_move
  FROM traced
), related_actions AS (
  SELECT r.command->>'action' AS action,count(*) AS count
  FROM public.competition_meet_requests r
  WHERE r.competition_id='3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5' AND (
    r.command->>'id' IN (SELECT imported_id::text FROM missing)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.command->'changes')='array' THEN r.command->'changes' ELSE '[]'::jsonb END) c
      WHERE c->>'id' IN (SELECT imported_id::text FROM missing)
    )
  ) GROUP BY r.command->>'action'
)
SELECT jsonb_build_object(
  'missing_original_keys',(SELECT count(*) FROM classified),
  'permanent_ids_present',(SELECT count(*) FROM classified WHERE current_id IS NOT NULL),
  'permanent_ids_missing',(SELECT count(*) FROM classified WHERE current_id IS NULL),
  'participant_identity_mismatch',(SELECT count(*) FROM classified WHERE current_id IS NOT NULL AND current_participant_id::text IS DISTINCT FROM participant_id),
  'explained_by_one_preserving_move',(SELECT count(*) FROM classified WHERE explained_by_one_preserving_move),
  'unexplained',(SELECT count(*) FROM classified WHERE explained_by_one_preserving_move IS NOT TRUE),
  'current_trials_match_move',(SELECT count(*) FROM classified WHERE explained_by_one_preserving_move
    AND performance->'trials' IS NOT DISTINCT FROM after_data->'performance'->'trials'),
  'current_state_counts',coalesce((SELECT jsonb_object_agg(state,count) FROM (
    SELECT state,count(*) AS count FROM classified WHERE state IS NOT NULL GROUP BY state
  ) states),'{}'::jsonb),
  'related_request_actions',coalesce((SELECT jsonb_object_agg(action,count) FROM related_actions WHERE action IS NOT NULL),'{}'::jsonb)
) AS legacy_meet_missing_appearances;
