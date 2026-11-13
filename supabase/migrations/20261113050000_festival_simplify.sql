-- 学祭ページを絞る（2026-11-13 所有者の指示）。
--   ・買い出しはやめる。募集は0件だったので表ごと消す。
--   ・指示と買い出しがなくなったので、学祭の通知もやめる（送った通知は0件）。
--     指示の表は残す（画面からは使っていない）。
--   ・日ごとに何個売れたかは、学祭ページを使える全員に見せる。金額はこれまでどおり
--     「日をまたいだ売上」の権限（can_manage_festival）だけ。
--   ・ロール「学祭店長2026」は「学祭2026」へ改名する（中身は同じ: 日をまたいだ売上を見られる）。
-- 再実行しても同じ状態になる（冪等）。

-- 1. 通知をやめる
DROP TRIGGER IF EXISTS festival_instructions_notify ON public.festival_instructions;
DROP TRIGGER IF EXISTS festival_shopping_trips_notify ON public.festival_shopping_trips;
DROP FUNCTION IF EXISTS public.festival_notify();
DELETE FROM public.notifications WHERE type IN ('festival_instruction', 'festival_trip');
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'comment', 'notice', 'schedule_update', 'sync_failure', 'thread_reply', 'mention', 'sheet_setup'
]));

-- 2. 買い出しの表を消す
DROP TABLE IF EXISTS public.festival_shopping_members;
DROP TABLE IF EXISTS public.festival_shopping_trips;

-- 3. 日ごとに売れた個数（日本時間の日付ごと、新しい順）。金額は返さない。
--    売上の行は直近1時間しか読めない人にも、個数の合計だけは見せるため SECURITY DEFINER。
CREATE OR REPLACE FUNCTION public.festival_daily_pieces()
RETURNS TABLE (day date, pieces bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (s.sold_at AT TIME ZONE 'Asia/Tokyo')::date AS day, sum(s.quantity)::bigint AS pieces
  FROM public.festival_sales s
  WHERE public.festival_is_member()
  GROUP BY 1
  ORDER BY 1 DESC;
$$;
REVOKE ALL ON FUNCTION public.festival_daily_pieces() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festival_daily_pieces() TO authenticated;

-- 4. ロールの改名。ロールの変更を守るトリガーを通すため service_role として書く。
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.roles SET name = '学祭2026'
  WHERE name = '学祭店長2026' AND NOT EXISTS (SELECT 1 FROM public.roles WHERE name = '学祭2026');
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

NOTIFY pgrst, 'reload schema';
