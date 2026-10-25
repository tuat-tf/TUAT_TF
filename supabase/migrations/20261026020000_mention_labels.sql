-- Keep @mention links working after a member renames: store the name as written with each mention
-- and link that text, instead of searching the body for the member's current name. Idempotent.

ALTER TABLE public.tweet_mentions ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE public.comment_mentions ADD COLUMN IF NOT EXISTS label text;

-- Mentions are inserted as "@<display name>" by the app, so the name at insert time is what was written.
CREATE OR REPLACE FUNCTION public.set_mention_label() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF NEW.label IS NULL THEN
    SELECT display_name INTO NEW.label FROM public.profiles WHERE id = NEW.profile_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.set_mention_label() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS set_mention_label ON public.tweet_mentions;
CREATE TRIGGER set_mention_label BEFORE INSERT ON public.tweet_mentions FOR EACH ROW EXECUTE FUNCTION public.set_mention_label();
DROP TRIGGER IF EXISTS set_mention_label ON public.comment_mentions;
CREATE TRIGGER set_mention_label BEFORE INSERT ON public.comment_mentions FOR EACH ROW EXECUTE FUNCTION public.set_mention_label();

-- Existing mentions: the current name, only where the body still contains it (otherwise left NULL = current name).
UPDATE public.tweet_mentions m SET label = p.display_name FROM public.profiles p, public.tweets t
 WHERE m.label IS NULL AND p.id = m.profile_id AND t.id = m.tweet_id AND position('@' || p.display_name IN t.content) > 0;
UPDATE public.comment_mentions m SET label = p.display_name FROM public.profiles p, public.comments c
 WHERE m.label IS NULL AND p.id = m.profile_id AND c.id = m.comment_id AND position('@' || p.display_name IN c.content) > 0;

CREATE OR REPLACE FUNCTION public.get_tweet_feed_extras(tweet_ids uuid[])
RETURNS TABLE(tweet_id uuid, options jsonb, mentions jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT t.id AS tweet_id,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'tweet_id', o.tweet_id, 'text', o.text, 'created_by', o.created_by, 'sort_order', o.sort_order,
        'vote_count', (SELECT COUNT(*) FROM public.tweet_poll_votes v WHERE v.option_id = o.id),
        'voted_by_me', EXISTS (SELECT 1 FROM public.tweet_poll_votes v WHERE v.option_id = o.id AND v.user_id = auth.uid()),
        'voters', CASE WHEN t.poll_anonymous THEN '[]'::JSONB ELSE COALESCE((
          SELECT jsonb_agg(jsonb_build_object('profile_id', p.id, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
            'blocks', COALESCE(p.blocks, ARRAY[]::TEXT[]), 'grade', p.grade) ORDER BY p.display_name, p.id)
          FROM public.tweet_poll_votes v JOIN public.profiles p ON p.id = v.user_id WHERE v.option_id = o.id), '[]'::JSONB) END
      ) ORDER BY o.sort_order, o.id)
      FROM public.tweet_poll_options o WHERE o.tweet_id = t.id), '[]'::JSONB) AS options,
    -- The name as written links, so a later rename does not break it.
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('profile_id', p.id, 'display_name', COALESCE(m.label, p.display_name)) ORDER BY p.display_name, p.id)
      FROM public.tweet_mentions m JOIN public.profiles p ON p.id = m.profile_id WHERE m.tweet_id = t.id), '[]'::JSONB) AS mentions
  FROM public.tweets t WHERE t.id = ANY(COALESCE(tweet_ids, ARRAY[]::UUID[]));
$function$;

NOTIFY pgrst, 'reload schema';
