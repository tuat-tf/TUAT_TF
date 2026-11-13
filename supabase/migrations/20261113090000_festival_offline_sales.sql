-- 学祭の売上を電波が無くても入れられるようにする（2026-11-13 所有者の依頼）。
-- 端末に置いた売上は、つながったときに「売った時刻」つきで送られてくる。
-- これまでは売った時刻を「いま±5分」に限っていたので、遅れて届いた売上が断られていた。
-- 過去は12時間前まで受け付ける（1日の営業中に電波が戻れば足りる）。未来は従来どおり5分まで。
-- 再実行しても同じ状態になる（冪等）。
DROP POLICY IF EXISTS festival_sales_insert ON public.festival_sales;
CREATE POLICY festival_sales_insert ON public.festival_sales FOR INSERT TO authenticated
  WITH CHECK (public.festival_is_member() AND recorded_by = auth.uid()
    AND sold_at BETWEEN now() - interval '12 hours' AND now() + interval '5 minutes');

NOTIFY pgrst, 'reload schema';
