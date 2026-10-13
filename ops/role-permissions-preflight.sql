-- Read-only migration preflight. Output is aggregate counts only, never identities or row data.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND (rolsuper OR rolbypassrls)) THEN
   RAISE EXCEPTION 'Run the aggregate preflight with a migration role that bypasses RLS';
 END IF;
END $$;
WITH expected AS (
 SELECT r.id,r.is_everyone,r.can_manage_system AS current_system,r.can_manage_members AS current_members,
   NOT r.is_everyone AND r.name='管理者' AS moderate,
   NOT r.is_everyone AND (r.name='OB戦2026' OR EXISTS(
     SELECT 1 FROM public.competition_meets m WHERE m.legacy_source='ob-2026' AND m.staff_role_id=r.id
   )) AS ob,
   CASE WHEN r.is_everyone THEN '{}'::text[]
     WHEN r.name IN ('中距離ブロック長','長距離ブロック長') THEN ARRAY['middle_long']
     WHEN r.name IN ('短距離ブロック長','投擲ブロック長','跳躍ブロック長') THEN ARRAY['short']
     ELSE '{}'::text[] END AS menu_blocks,
   coalesce((to_jsonb(r)->>'can_moderate_comments')::boolean,false) AS current_moderate,
   coalesce((to_jsonb(r)->>'can_manage_ob_meet')::boolean,false) AS current_ob,
   ARRAY(SELECT jsonb_array_elements_text(coalesce(to_jsonb(r)->'editable_menu_blocks','[]'::jsonb))) AS current_blocks
 FROM public.roles r
), schema_status AS (
 SELECT count(*) AS capability_columns FROM information_schema.columns
 WHERE table_schema='public' AND table_name='roles'
 AND column_name IN ('can_moderate_comments','can_manage_ob_meet','editable_menu_blocks')
)
SELECT jsonb_build_object(
 'roleCount',(SELECT count(*) FROM expected),
 'assignmentCount',(SELECT count(*) FROM public.profile_roles),
 'capabilityColumns',(SELECT capability_columns FROM schema_status),
 'initialModerationRoles',(SELECT count(*) FROM expected WHERE moderate),
 'initialObRoles',(SELECT count(*) FROM expected WHERE ob),
 'initialScopedMenuRoles',(SELECT count(*) FROM expected WHERE cardinality(menu_blocks)>0),
 'initialChangedRoles',(SELECT count(*) FROM expected WHERE moderate IS DISTINCT FROM current_moderate OR ob IS DISTINCT FROM current_ob OR menu_blocks IS DISTINCT FROM current_blocks),
 'legacyStaffEveryoneViolations',(SELECT count(*) FROM public.competition_meets m JOIN public.roles r ON r.id=m.staff_role_id WHERE m.legacy_source='ob-2026' AND r.is_everyone),
 'everyoneCapabilityViolations',(SELECT count(*) FROM expected WHERE is_everyone AND (current_system OR current_members OR current_moderate OR current_ob OR cardinality(current_blocks)>0)),
 'invalidMenuScopeViolations',(SELECT count(*) FROM expected WHERE NOT current_blocks <@ ARRAY['short','middle_long']::text[] OR array_position(current_blocks,NULL) IS NOT NULL),
 'legacyStaffCapabilityMissing',(SELECT count(*) FROM public.competition_meets m JOIN expected e ON e.id=m.staff_role_id WHERE m.legacy_source='ob-2026' AND NOT e.current_ob)
) AS permission_preflight_counts;
-- Initial expectations describe the one-time copy only. Once columns exist, changed
-- settings and labels are authoritative and must not be reset from these expectations.
ROLLBACK;
