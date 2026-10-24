-- Two SECURITY DEFINER reads that the app no longer calls bypassed RLS for any logged-in member:
-- get_poll_voters returned voters of any non-anonymous poll by tweet id (plus each voter's private
-- block list), and count_comments_by_target counted comments on any target. Revoke execution; the
-- functions stay defined so an old client fails closed instead of erroring on a missing function.
DO $$
BEGIN
  IF to_regprocedure('public.get_poll_voters(uuid[])') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_poll_voters(uuid[]) FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('public.count_comments_by_target(text,uuid[])') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.count_comments_by_target(text, uuid[]) FROM PUBLIC, anon, authenticated;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
