-- Keep the existing table RLS as the authority. No service-role/definer writes.
-- Functions add no tables, so failover change logging remains on the existing tables.
CREATE OR REPLACE FUNCTION public.save_note_folder(
  p_id uuid, p_expected_updated_at timestamptz, p_values jsonb, p_editor_ids uuid[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  old_note public.notes%ROWTYPE;
  saved public.notes%ROWTYPE;
  manage_permissions boolean;
  editors uuid[] := COALESCE(p_editor_ids, ARRAY[]::uuid[]);
  removed_count integer;
  expected_removed integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  IF p_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
    OR char_length(btrim(COALESCE(p_values->>'title', ''))) NOT BETWEEN 1 AND 100
    OR COALESCE(p_values->>'status', '') NOT IN ('draft','published') THEN
    RAISE EXCEPTION 'Invalid folder' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO old_note FROM public.notes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Folder unavailable' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.notes(id, author_id, scope, theme_id, title, description, body, status, edit_policy, parent_id)
    VALUES (p_id, auth.uid(), p_values->>'scope', NULL, btrim(p_values->>'title'),
      NULLIF(btrim(p_values->>'description'), ''), '', p_values->>'status', p_values->>'edit_policy',
      NULLIF(p_values->>'parent_id', '')::uuid) RETURNING * INTO saved;
    manage_permissions := true;
  ELSE
    IF p_expected_updated_at IS NULL OR old_note.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Folder changed' USING ERRCODE = '40001';
    END IF;
    IF NOT public.can_edit_note(p_id) THEN RAISE EXCEPTION 'Folder not editable' USING ERRCODE = '42501'; END IF;
    manage_permissions := old_note.author_id = auth.uid() OR public.is_admin();
    IF manage_permissions THEN
      UPDATE public.notes SET scope = p_values->>'scope', theme_id = NULL,
        title = btrim(p_values->>'title'), description = NULLIF(btrim(p_values->>'description'), ''),
        status = p_values->>'status', edit_policy = p_values->>'edit_policy',
        parent_id = NULLIF(p_values->>'parent_id', '')::uuid WHERE id = p_id RETURNING * INTO saved;
    ELSE
      -- Do not silently save part of a former administrator's request after a
      -- role change. An ordinary non-owner sends these unchanged baseline values.
      IF old_note.scope IS DISTINCT FROM p_values->>'scope'
        OR NULLIF(btrim(old_note.description),'') IS DISTINCT FROM NULLIF(btrim(p_values->>'description'),'')
        OR old_note.edit_policy IS DISTINCT FROM p_values->>'edit_policy'
        OR old_note.parent_id IS DISTINCT FROM NULLIF(p_values->>'parent_id','')::uuid
        OR ARRAY(SELECT user_id FROM public.note_editors WHERE note_id=p_id ORDER BY user_id)
          IS DISTINCT FROM ARRAY(SELECT x FROM unnest(editors) x ORDER BY x) THEN
        RAISE EXCEPTION 'Folder management permission changed' USING ERRCODE = '42501';
      END IF;
      -- Match the existing non-owner form: only title/status.
      UPDATE public.notes SET title = btrim(p_values->>'title'), status = p_values->>'status'
        WHERE id = p_id RETURNING * INTO saved;
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION 'Folder update refused' USING ERRCODE = '42501'; END IF;
  END IF;
  IF manage_permissions THEN
    IF array_position(editors, NULL) IS NOT NULL OR cardinality(editors) <> (SELECT count(DISTINCT x) FROM unnest(editors) x)
      OR (saved.edit_policy = 'specified' AND cardinality(editors) = 0) THEN
      RAISE EXCEPTION 'Invalid editors' USING ERRCODE = '23514';
    END IF;
    IF saved.edit_policy <> 'specified' THEN editors := ARRAY[]::uuid[]; END IF;
    SELECT count(*) INTO expected_removed FROM public.note_editors WHERE note_id = p_id AND NOT(user_id = ANY(editors));
    DELETE FROM public.note_editors WHERE note_id = p_id AND NOT(user_id = ANY(editors));
    GET DIAGNOSTICS removed_count = ROW_COUNT;
    IF removed_count <> expected_removed THEN RAISE EXCEPTION 'Editor removal refused' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.note_editors(note_id, user_id)
      SELECT p_id, x FROM unnest(editors) x
      WHERE NOT EXISTS(SELECT 1 FROM public.note_editors e WHERE e.note_id = p_id AND e.user_id = x);
  END IF;
  RETURN jsonb_build_object('id', saved.id, 'updated_at', saved.updated_at);
END;
$$;

-- Vote totals are private under RLS and options have no UPDATE policy. A shared
-- advisory lock in ordinary invoker INSERT triggers serializes new votes/options with a save
-- without granting UPDATE or adding a privileged writer.
CREATE OR REPLACE FUNCTION public.lock_note_poll_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE article_id uuid; article_author uuid; allow_options boolean; note_id uuid;
  check_member boolean := auth.uid() IS NOT NULL
    AND COALESCE(NULLIF(current_setting('request.jwt.claims',true),'')::jsonb->>'role','') <> 'service_role';
BEGIN
  IF TG_TABLE_NAME = 'note_poll_options' THEN
    article_id := NEW.article_id;
  ELSE
    SELECT o.article_id INTO article_id FROM public.note_poll_options o
      WHERE o.id = NEW.option_id;
  END IF;
  IF article_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('tuat:note-poll:' || article_id::text, 0));
  END IF;
  -- A waiting INSERT can have an old outer-statement RLS snapshot. Recheck the
  -- same permission against a fresh query after obtaining the lock.
  IF TG_TABLE_NAME = 'note_poll_options' THEN
    SELECT a.author_id, a.poll_allow_options, a.note_id INTO article_author, allow_options, note_id
      FROM public.note_articles a WHERE a.id = article_id;
    IF check_member AND (NEW.created_by IS DISTINCT FROM auth.uid() OR note_id IS NULL
      OR NOT public.can_view_note(note_id) OR NOT(article_author = auth.uid() OR allow_options)) THEN
      RAISE EXCEPTION 'Option insert refused' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT a.note_id INTO note_id FROM public.note_poll_options o JOIN public.note_articles a ON a.id = o.article_id
      WHERE o.id = NEW.option_id;
    IF check_member AND (NEW.user_id IS DISTINCT FROM auth.uid() OR note_id IS NULL OR NOT public.can_view_note(note_id)) THEN
      RAISE EXCEPTION 'Vote insert refused' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS serialize_note_poll_options ON public.note_poll_options;
CREATE TRIGGER serialize_note_poll_options BEFORE INSERT ON public.note_poll_options
  FOR EACH ROW EXECUTE FUNCTION public.lock_note_poll_change();
DROP TRIGGER IF EXISTS serialize_note_poll_votes ON public.note_poll_votes;
CREATE TRIGGER serialize_note_poll_votes BEFORE INSERT ON public.note_poll_votes
  FOR EACH ROW EXECUTE FUNCTION public.lock_note_poll_change();
REVOKE ALL ON FUNCTION public.lock_note_poll_change() FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.save_note_article(
  p_id uuid, p_note_id uuid, p_expected_updated_at timestamptz, p_values jsonb,
  p_existing_option_ids uuid[], p_kept_option_ids uuid[], p_new_options jsonb, p_poll_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  old_article public.note_articles%ROWTYPE;
  saved public.note_articles%ROWTYPE;
  existing uuid[] := COALESCE(p_existing_option_ids, ARRAY[]::uuid[]);
  kept uuid[] := COALESCE(p_kept_option_ids, ARRAY[]::uuid[]);
  actual uuid[];
  dropped uuid[];
  expected_removed integer;
  removed_count integer;
  poll_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_note(p_note_id) THEN
    RAISE EXCEPTION 'Article not editable' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_values IS NULL OR jsonb_typeof(p_values) <> 'object'
    OR char_length(btrim(COALESCE(p_values->>'title', ''))) NOT BETWEEN 1 AND 100
    OR p_poll_enabled IS NULL OR p_new_options IS NULL OR jsonb_typeof(p_new_options) <> 'array' THEN
    RAISE EXCEPTION 'Invalid article' USING ERRCODE = '23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('tuat:note-poll:' || p_id::text, 0));
  SELECT * INTO old_article FROM public.note_articles WHERE id = p_id AND note_id = p_note_id FOR UPDATE;
  IF NOT FOUND THEN
    IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'Article unavailable' USING ERRCODE = '42501'; END IF;
    INSERT INTO public.note_articles(id, note_id, author_id, title, body, poll_multiple, poll_anonymous, poll_allow_options)
    VALUES(p_id, p_note_id, auth.uid(), btrim(p_values->>'title'), COALESCE(p_values->>'body',''),
      p_poll_enabled AND COALESCE((p_values->>'poll_multiple')::boolean,false),
      COALESCE((p_values->>'poll_anonymous')::boolean,true),
      p_poll_enabled AND COALESCE((p_values->>'poll_allow_options')::boolean,false)) RETURNING * INTO saved;
  ELSE
    IF p_expected_updated_at IS NULL OR old_article.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Article changed' USING ERRCODE = '40001';
    END IF;
    UPDATE public.note_articles SET title = btrim(p_values->>'title'), body = COALESCE(p_values->>'body',''),
      poll_multiple = p_poll_enabled AND COALESCE((p_values->>'poll_multiple')::boolean,false),
      poll_anonymous = COALESCE((p_values->>'poll_anonymous')::boolean,true),
      poll_allow_options = p_poll_enabled AND COALESCE((p_values->>'poll_allow_options')::boolean,false)
      WHERE id = p_id AND note_id = p_note_id RETURNING * INTO saved;
    IF NOT FOUND THEN RAISE EXCEPTION 'Article update refused' USING ERRCODE = '42501'; END IF;
  END IF;
  -- New votes/options use the same lock, including older clients. Deletes do not
  -- take the advisory lock after a row lock: no reversed lock order/deadlock.
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[]) INTO actual FROM public.note_poll_options WHERE article_id = p_id;
  IF actual IS DISTINCT FROM ARRAY(SELECT x FROM unnest(existing) x ORDER BY x) THEN
    RAISE EXCEPTION 'Poll changed' USING ERRCODE = '40001';
  END IF;
  IF NOT p_poll_enabled THEN kept := ARRAY[]::uuid[]; END IF;
  IF array_position(kept,NULL) IS NOT NULL OR cardinality(kept) <> (SELECT count(DISTINCT x) FROM unnest(kept) x)
    OR NOT kept <@ actual OR (p_poll_enabled AND cardinality(kept) + jsonb_array_length(p_new_options) < 2) THEN
    RAISE EXCEPTION 'Invalid options' USING ERRCODE = '23514';
  END IF;
  dropped := ARRAY(SELECT x FROM unnest(actual) x WHERE NOT(x = ANY(kept)));
  IF p_poll_enabled AND cardinality(dropped) > 0 THEN
    -- Reuse the existing visibility-checked aggregate; raw votes remain private under RLS.
    SELECT options INTO poll_summary FROM public.get_note_poll_options(ARRAY[p_id]);
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(COALESCE(poll_summary,'[]'::jsonb)) o
      WHERE (o->>'id')::uuid = ANY(dropped) AND (o->>'vote_count')::integer > 0) THEN
      RAISE EXCEPTION 'Voted option cannot be removed' USING ERRCODE = '23514';
    END IF;
  END IF;
  expected_removed := cardinality(dropped);
  DELETE FROM public.note_poll_options WHERE article_id = p_id AND id = ANY(dropped);
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  IF removed_count <> expected_removed THEN RAISE EXCEPTION 'Option removal refused' USING ERRCODE = '42501'; END IF;
  IF p_poll_enabled THEN
    INSERT INTO public.note_poll_options(id, article_id, text, created_by, sort_order)
      SELECT (o->>'id')::uuid, p_id, btrim(o->>'text'), auth.uid(),
        COALESCE((SELECT max(sort_order) FROM public.note_poll_options WHERE article_id = p_id AND id = ANY(kept)), -1) + ord::integer
      FROM jsonb_array_elements(p_new_options) WITH ORDINALITY AS t(o,ord);
  END IF;
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[]) INTO actual FROM public.note_poll_options WHERE article_id = p_id;
  IF actual IS DISTINCT FROM ARRAY(
    SELECT x FROM (
      SELECT unnest(kept) AS x
      UNION ALL SELECT (o->>'id')::uuid FROM jsonb_array_elements(p_new_options) o WHERE p_poll_enabled
    ) desired ORDER BY x
  ) THEN RAISE EXCEPTION 'Poll changed during save' USING ERRCODE = '40001'; END IF;
  RETURN jsonb_build_object('id', saved.id, 'updated_at', saved.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_competition_countdown(p_target_id text, p_expected_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE current_id text; affected integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_system() THEN
    RAISE EXCEPTION 'Management permission required' USING ERRCODE = '42501';
  END IF;
  -- Deterministic row locking serializes both off/on steps without a new state table.
  PERFORM id FROM public.competitions ORDER BY id FOR UPDATE;
  SELECT id INTO current_id FROM public.competitions WHERE is_countdown;
  IF current_id IS DISTINCT FROM p_expected_id THEN RAISE EXCEPTION 'Countdown changed' USING ERRCODE = '40001'; END IF;
  IF p_target_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.competitions WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Competition unavailable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.competitions SET is_countdown = false WHERE is_countdown;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF current_id IS NOT NULL AND affected <> 1 THEN RAISE EXCEPTION 'Countdown clear refused' USING ERRCODE = '42501'; END IF;
  IF p_target_id IS NOT NULL THEN
    UPDATE public.competitions SET is_countdown = true WHERE id = p_target_id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Countdown update refused' USING ERRCODE = '42501'; END IF;
  END IF;
  RETURN jsonb_build_object('countdown_id', p_target_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_note_folder(uuid,timestamptz,jsonb,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_note_article(uuid,uuid,timestamptz,jsonb,uuid[],uuid[],jsonb,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_competition_countdown(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_note_folder(uuid,timestamptz,jsonb,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_note_article(uuid,uuid,timestamptz,jsonb,uuid[],uuid[],jsonb,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_competition_countdown(text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
