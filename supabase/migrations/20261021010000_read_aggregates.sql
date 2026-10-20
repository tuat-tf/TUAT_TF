-- Read only aggregates execute with the caller's table privileges and RLS.
-- Do not grant anonymous access or use SECURITY DEFINER for these reads.
CREATE OR REPLACE FUNCTION public.get_note_content_counts(requested_note_ids uuid[])
RETURNS TABLE(note_id uuid, article_count bigint, child_count bigint, thread_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT n.id,
    (SELECT count(*) FROM public.note_articles a WHERE a.note_id = n.id),
    (SELECT count(*) FROM public.notes child WHERE child.parent_id = n.id),
    (SELECT count(*) FROM public.threads t WHERE t.folder_id = n.id)
  FROM public.notes n WHERE n.id = ANY(requested_note_ids)
$$;
REVOKE ALL ON FUNCTION public.get_note_content_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_note_content_counts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_thread_post_counts(requested_thread_ids uuid[])
RETURNS TABLE(thread_id uuid, post_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT t.id, (SELECT count(*) FROM public.thread_posts p WHERE p.thread_id = t.id)
  FROM public.threads t WHERE t.id = ANY(requested_thread_ids)
$$;
REVOKE ALL ON FUNCTION public.get_thread_post_counts(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_thread_post_counts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_monthly_distance_ranking(period_start date, period_end date)
RETURNS TABLE(id uuid, display_name text, grade text, blocks text[], avatar_url text,
  km_low numeric, km_mid numeric, km_high numeric, km_speed numeric, km_other numeric, total_km numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT p.id, p.display_name, p.grade, p.blocks, p.avatar_url,
    round(sum(coalesce(r.dist_low, 0))::numeric, 2),
    round(sum(coalesce(r.dist_mid, 0))::numeric, 2),
    round(sum(coalesce(r.dist_high, 0))::numeric, 2),
    round(sum(coalesce(r.dist_speed, 0))::numeric, 2),
    round(sum(greatest(coalesce(r.dist_actual, 0) - distance.intensity, 0))::numeric, 2),
    round(sum(greatest(distance.intensity, coalesce(r.dist_actual, 0)))::numeric, 2)
  FROM public.profiles p
  JOIN public.practice_records r ON r.user_id = p.id
  CROSS JOIN LATERAL (SELECT coalesce(r.dist_low, 0) + coalesce(r.dist_mid, 0)
    + coalesce(r.dist_high, 0) + coalesce(r.dist_speed, 0) AS intensity) distance
  WHERE p.blocks @> ARRAY['middle_long']::text[]
    AND r.recorded_date BETWEEN period_start AND period_end
  GROUP BY p.id, p.display_name, p.grade, p.blocks, p.avatar_url
  HAVING sum(greatest(distance.intensity, coalesce(r.dist_actual, 0))) > 0
$$;
REVOKE ALL ON FUNCTION public.get_monthly_distance_ranking(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_distance_ranking(date, date) TO authenticated;
NOTIFY pgrst, 'reload schema';
