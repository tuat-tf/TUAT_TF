-- 日ごとに「何個入りが何回売れたか」（2026-11-13 所有者の指示: 全員に見せてよい）。
--   日本時間の日付 × 1会計の個数ごとの会計数。金額は返さない。
--   売上の行は直近1時間しか読めない人にも集計だけ見せるため SECURITY DEFINER。
-- 再実行しても同じ状態になる（冪等）。

CREATE OR REPLACE FUNCTION public.festival_daily_orders()
RETURNS TABLE (day date, quantity integer, orders bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (s.sold_at AT TIME ZONE 'Asia/Tokyo')::date AS day, s.quantity, count(*)::bigint AS orders
  FROM public.festival_sales s
  WHERE public.festival_is_member()
  GROUP BY 1, 2
  ORDER BY 1 DESC, 2;
$$;
REVOKE ALL ON FUNCTION public.festival_daily_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.festival_daily_orders() TO authenticated;

NOTIFY pgrst, 'reload schema';
