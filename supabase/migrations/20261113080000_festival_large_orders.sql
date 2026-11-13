-- 1会計の個数を21個以上も入れられるようにする（2026-11-13 所有者の指示: 20個まではボタン、それ以上は入力）。
--   上限は200個（打ち間違いで桁がずれた値を入れないため）。価格はアプリ側で計算する。
-- 再実行しても同じ状態になる（冪等）。
ALTER TABLE public.festival_sales DROP CONSTRAINT IF EXISTS festival_sales_quantity_check;
ALTER TABLE public.festival_sales ADD CONSTRAINT festival_sales_quantity_check CHECK (quantity BETWEEN 1 AND 200);
