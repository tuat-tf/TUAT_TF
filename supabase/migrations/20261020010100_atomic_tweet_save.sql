-- Apply the unpublished atomic save after the current production migration chain.
-- The existing own-tweet/poll/mention RLS and notification triggers remain in
-- force. R2 upload is a separate step, not part of this database transaction.
CREATE OR REPLACE FUNCTION public.save_tweet(
  p_id uuid, p_values jsonb, p_poll_options text[], p_mention_ids uuid[],
  p_edit boolean, p_expected_content text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  old_tweet public.tweets%ROWTYPE;
  options text[] := COALESCE(p_poll_options, ARRAY[]::text[]);
  mentions uuid[] := COALESCE(p_mention_ids, ARRAY[]::uuid[]);
  image_path text := p_values->>'image_path';
  poll_enabled boolean := COALESCE((p_values->>'poll_enabled')::boolean, cardinality(options) > 0);
  affected integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL OR p_edit IS NULL OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
    OR p_values->>'content' IS NULL THEN RAISE EXCEPTION 'Invalid tweet' USING ERRCODE = '23514'; END IF;
  IF p_edit THEN
    SELECT * INTO old_tweet FROM public.tweets WHERE id = p_id FOR UPDATE;
    IF NOT FOUND OR old_tweet.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Tweet not editable' USING ERRCODE = '42501'; END IF;
    IF p_expected_content IS NULL OR old_tweet.content IS DISTINCT FROM p_expected_content THEN
      RAISE EXCEPTION 'Tweet changed' USING ERRCODE = '40001';
    END IF;
    -- Editing keeps the existing contract: content only, no poll/quote/image replacement.
    UPDATE public.tweets SET content = p_values->>'content' WHERE id = p_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Tweet update refused' USING ERRCODE = '42501'; END IF;
  ELSE
    IF (poll_enabled AND cardinality(options) < 2) OR (NOT poll_enabled AND cardinality(options) > 0)
      OR array_position(options,NULL) IS NOT NULL OR array_position(mentions,NULL) IS NOT NULL
      OR cardinality(mentions) <> (SELECT count(DISTINCT x) FROM unnest(mentions) x) THEN
      RAISE EXCEPTION 'Invalid poll or mentions' USING ERRCODE = '23514';
    END IF;
    IF image_path IS NOT NULL AND (image_path NOT LIKE auth.uid()::text || '/%'
      OR image_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$') THEN
      RAISE EXCEPTION 'Image ownership required' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.tweets(id,user_id,content,image_path,expires_at,quoted_type,quoted_id,poll_multiple,poll_anonymous,poll_allow_options)
    VALUES(p_id,auth.uid(),p_values->>'content',image_path,(p_values->>'expires_at')::timestamptz,
      p_values->>'quoted_type',(p_values->>'quoted_id')::uuid,
      poll_enabled AND COALESCE((p_values->>'poll_multiple')::boolean,false),
      COALESCE((p_values->>'poll_anonymous')::boolean,true),
      poll_enabled AND COALESCE((p_values->>'poll_allow_options')::boolean,false));
    INSERT INTO public.tweet_poll_options(tweet_id,text,created_by,sort_order)
      SELECT p_id,btrim(text),auth.uid(),ord::integer - 1 FROM unnest(options) WITH ORDINALITY AS t(text,ord);
    INSERT INTO public.tweet_mentions(tweet_id,profile_id) SELECT p_id,x FROM unnest(mentions) x;
  END IF;
  RETURN jsonb_build_object('id',p_id);
END;
$$;
REVOKE ALL ON FUNCTION public.save_tweet(uuid,jsonb,text[],uuid[],boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_tweet(uuid,jsonb,text[],uuid[],boolean,text) TO authenticated;
NOTIFY pgrst,'reload schema';
