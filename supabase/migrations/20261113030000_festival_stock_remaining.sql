-- 学祭の材料を「残量」で管理する（2026-11-13 所有者の指示）。
--   count は残りの数。initial_count は用意した数（補充したら増やす）で、残りの割合を出すのに使う。
--   使ったら festival_adjust_stock(id, -1) で減らす。関数は前の migration のまま。
-- 再実行しても同じ状態になる（冪等）。

ALTER TABLE public.festival_stock_items
  ADD COLUMN IF NOT EXISTS initial_count integer NOT NULL DEFAULT 0 CHECK (initial_count BETWEEN 0 AND 9999);

-- すでに入っている材料は、いまの数を「用意した数」として扱う。
UPDATE public.festival_stock_items SET initial_count = count WHERE initial_count < count;

NOTIFY pgrst, 'reload schema';
