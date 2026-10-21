-- Keep the first race and its results intact; each race uses the existing
-- six-lane editor, checked save RPC, permissions and result export.
DO $$
DECLARE
 competition text := '3e2a2b1e-21d1-49b0-a1e8-40bf595fb7e5';
 first_race public.competition_meet_events%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('meet/' || competition, 0));
 SELECT * INTO first_race FROM public.competition_meet_events
 WHERE competition_id = competition AND name = '4×300mリレー';
 IF NOT FOUND OR first_race.relay_results IS NULL THEN
  RAISE EXCEPTION 'meet_relay_first_heat_missing';
 END IF;
 INSERT INTO public.competition_meet_events
  (competition_id, name, family, division, starts_at, sort_order, discipline, wind, capacity, relay_results)
 VALUES
  (competition, '4×300mリレー 2組目', first_race.family, '混合', NULL,
   (SELECT coalesce(max(sort_order), 0) + 1 FROM public.competition_meet_events WHERE competition_id = competition),
   'track', false, 6,
   (SELECT jsonb_agg(jsonb_build_object('lane', n, 'name', '', 'time', '', 'members', jsonb_build_array('', '', '', '')) ORDER BY n)
    FROM generate_series(1, 6) n))
 ON CONFLICT (competition_id, name) DO NOTHING;
END $$;
-- No new table or RPC: existing event history and backup coverage apply.
NOTIFY pgrst, 'reload schema';
