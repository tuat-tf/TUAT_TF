-- Timeline search and #hashtags (owner request 2026-10-26).
-- Each post is matched on its text, the author's name/reading and its replies. Every space-separated
-- word must match; a "#tag" word matches that whole hashtag only (#朝練 does not find #朝練習).
-- Full/half width and case are ignored (NFKC + lower). Runs as the caller, so RLS still decides what
-- can be found. The same timeline rules as getFeed apply (expired stories, empty/future/old sheet
-- records are left out). Returns ids only; the app loads them like the timeline. Idempotent.

CREATE OR REPLACE FUNCTION public.search_feed(
  p_query text, p_before_at timestamptz DEFAULT NULL, p_before_id uuid DEFAULT NULL, p_limit integer DEFAULT 30)
RETURNS TABLE(kind text, id uuid, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO '' AS $$
  WITH terms AS (
    SELECT term, left(term, 1) = '#' AND length(term) > 1 AS is_tag
    FROM unnest(regexp_split_to_array(lower(normalize(btrim(coalesce(p_query, '')), NFKC)), '\s+')) AS term
    WHERE term <> ''
    LIMIT 5
  ),
  today AS (SELECT (now() AT TIME ZONE 'Asia/Tokyo')::date AS d),
  docs AS (
    SELECT 'tweet'::text AS kind, t.id, t.created_at,
      lower(normalize(concat_ws(' ', t.content, p.display_name, p.mention_reading,
        (SELECT string_agg(c.content, ' ') FROM public.comments c WHERE c.target_type = 'tweet' AND c.target_id = t.id)), NFKC)) AS hay
    FROM public.tweets t JOIN public.profiles p ON p.id = t.user_id
    WHERE t.expires_at IS NULL OR t.expires_at > now()
    UNION ALL
    SELECT 'record', r.id, r.created_at,
      lower(normalize(concat_ws(' ', r.result_text, r.menu_text, r.memo, r.focus_text, r.strength_text, r.condition,
        p.display_name, p.mention_reading,
        (SELECT string_agg(c.content, ' ') FROM public.comments c WHERE c.target_type = 'record' AND c.target_id = r.id)), NFKC))
    FROM public.practice_records r JOIN public.profiles p ON p.id = r.user_id, today
    WHERE public.record_has_content(r)
      AND r.recorded_date <= today.d
      AND (NOT r.from_sheet OR (r.recorded_date < today.d AND r.recorded_date >= DATE '2026-07-04'))
  )
  SELECT d.kind, d.id, d.created_at FROM docs d
  WHERE EXISTS (SELECT 1 FROM terms)
    AND (p_before_at IS NULL OR (d.created_at, d.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
    AND NOT EXISTS (
      SELECT 1 FROM terms WHERE NOT CASE WHEN is_tag
        -- Same boundaries as src/lib/hashtags.ts (after NFKC).
        THEN d.hay ~ ('(^|[^0-9a-z&_])#' || regexp_replace(substr(term, 2), '([^[:alnum:]])', '\\\1', 'g')
          || '($|[[:space:]#.,!?、。「」『』()<>:;"''”’@/・~〜])')
        ELSE strpos(d.hay, term) > 0 END)
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT least(greatest(coalesce(p_limit, 30), 1), 100);
$$;
REVOKE ALL ON FUNCTION public.search_feed(text, timestamptz, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_feed(text, timestamptz, uuid, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
