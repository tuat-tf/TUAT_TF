-- 月ごとの目標と、その月の振り返り（目標ページで本人が書く）。
--   month は月の1日（例: 2026-11-01）。1人1か月1行。
--   本人だけが読み書きする（プロフィールの自由入力の目標とは別で、他の部員には見せない）。
-- 再実行しても同じ状態になる（冪等）。

CREATE TABLE IF NOT EXISTS public.monthly_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  goal text CHECK (goal IS NULL OR length(goal) <= 300),
  reflection text CHECK (reflection IS NULL OR length(reflection) <= 1000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

ALTER TABLE public.monthly_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS monthly_goals_read ON public.monthly_goals;
CREATE POLICY monthly_goals_read ON public.monthly_goals FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS monthly_goals_insert ON public.monthly_goals;
CREATE POLICY monthly_goals_insert ON public.monthly_goals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS monthly_goals_update ON public.monthly_goals;
CREATE POLICY monthly_goals_update ON public.monthly_goals FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
REVOKE ALL ON public.monthly_goals FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.monthly_goals TO authenticated;
