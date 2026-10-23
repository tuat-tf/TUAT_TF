-- Release a reservation whose provider explicitly reported that nothing was written
-- (GAS written:false: lock timeout, unknown sheet, rejected request before any mutation).
-- Only a still-reserved attempt with the exact same target/payload binding is removed, so the
-- record stays pending and the next sync sends it normally. Unknown results are never released.
CREATE OR REPLACE FUNCTION public.sheet_push_release(
  p_attempt_id uuid, p_target_fingerprint text, p_payload_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  attempt public.sheet_push_attempts%ROWTYPE;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Service role required';
  END IF;
  SELECT * INTO attempt FROM public.sheet_push_attempts WHERE attempt_id = p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Sheet attempt not found'; END IF;
  IF attempt.target_fingerprint IS DISTINCT FROM p_target_fingerprint OR attempt.payload_sha256 IS DISTINCT FROM p_payload_sha256 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Sheet result binding mismatch';
  END IF;
  IF attempt.state <> 'reserved' THEN
    RETURN jsonb_build_object('outcome', attempt.state, 'marker_status', attempt.marker_status);
  END IF;
  DELETE FROM public.sheet_push_attempts WHERE attempt_id = p_attempt_id AND state = 'reserved';
  RETURN jsonb_build_object('outcome', 'released');
END;
$$;

REVOKE ALL ON FUNCTION public.sheet_push_release(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sheet_push_release(uuid,text,text) TO service_role;
NOTIFY pgrst, 'reload schema';
