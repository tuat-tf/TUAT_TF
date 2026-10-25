-- @mentions in replies (comments), like tweet mentions (owner request 2026-10-26).
-- A comment and its mentions are saved together by add_comment, which runs as the caller so the
-- existing comments RLS still decides who may comment. Mentioned members get the same 'mention'
-- notification as tweet mentions, pointing at the commented post. Idempotent.

CREATE TABLE IF NOT EXISTS public.comment_mentions (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, profile_id)
);
CREATE INDEX IF NOT EXISTS comment_mentions_profile_idx ON public.comment_mentions (profile_id);
ALTER TABLE public.comment_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS require_login_access ON public.comment_mentions;
CREATE POLICY require_login_access ON public.comment_mentions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.login_access_allowed())) WITH CHECK ((SELECT public.login_access_allowed()));
DROP POLICY IF EXISTS comment_mentions_select ON public.comment_mentions;
CREATE POLICY comment_mentions_select ON public.comment_mentions FOR SELECT TO authenticated USING (public.is_member());
DROP POLICY IF EXISTS comment_mentions_insert_own ON public.comment_mentions;
CREATE POLICY comment_mentions_insert_own ON public.comment_mentions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = auth.uid()));
DROP POLICY IF EXISTS comment_mentions_delete_own ON public.comment_mentions;
CREATE POLICY comment_mentions_delete_own ON public.comment_mentions FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.comments c WHERE c.id = comment_id AND c.user_id = auth.uid()));

REVOKE ALL ON public.comment_mentions FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.comment_mentions TO authenticated;
GRANT ALL ON public.comment_mentions TO service_role;

-- Same write guards as every other table (backup read-only window, PC write guard, change log).
DROP TRIGGER IF EXISTS pc_backup_read_only ON public.comment_mentions;
CREATE TRIGGER pc_backup_read_only BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.comment_mentions
  FOR EACH STATEMENT EXECUTE FUNCTION pc_ops.guard_backup_writes();
DROP TRIGGER IF EXISTS pc_guard_writes ON public.comment_mentions;
CREATE TRIGGER pc_guard_writes BEFORE INSERT OR DELETE OR UPDATE OR TRUNCATE ON public.comment_mentions
  FOR EACH STATEMENT EXECUTE FUNCTION pc_ops.guard_writes();
DROP TRIGGER IF EXISTS zz_log_failover_change ON public.comment_mentions;
CREATE TRIGGER zz_log_failover_change AFTER INSERT OR DELETE OR UPDATE ON public.comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.log_failover_change('comment_id', 'profile_id');

CREATE OR REPLACE FUNCTION public.handle_comment_mention_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.comments%ROWTYPE;
BEGIN
  IF public.is_mirror_write() THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.comments WHERE id = NEW.comment_id;
  IF FOUND AND NEW.profile_id <> c.user_id AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.profile_id AND status = 'active' AND notify_mention) THEN
    INSERT INTO public.notifications (user_id, actor_id, type, reference_type, reference_id)
    VALUES (NEW.profile_id, c.user_id, 'mention', c.target_type, c.target_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.handle_comment_mention_notification() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS comment_mention_notification ON public.comment_mentions;
CREATE TRIGGER comment_mention_notification AFTER INSERT ON public.comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.handle_comment_mention_notification();

-- One transaction for the comment and its mentions; the caller's RLS applies to both inserts.
CREATE OR REPLACE FUNCTION public.add_comment(p_target_type text, p_target_id uuid, p_content text, p_mention_ids uuid[])
RETURNS public.comments LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE added public.comments%ROWTYPE;
BEGIN
  IF cardinality(coalesce(p_mention_ids, '{}')) > 20 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Too many mentions';
  END IF;
  INSERT INTO public.comments (user_id, target_type, target_id, content)
  VALUES (auth.uid(), p_target_type, p_target_id, p_content) RETURNING * INTO added;
  INSERT INTO public.comment_mentions (comment_id, profile_id)
  SELECT added.id, m FROM (SELECT DISTINCT unnest(coalesce(p_mention_ids, '{}')) AS m) ids
  WHERE m <> added.user_id AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = m AND p.status = 'active');
  RETURN added;
END $$;
REVOKE ALL ON FUNCTION public.add_comment(text, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_comment(text, uuid, text, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
