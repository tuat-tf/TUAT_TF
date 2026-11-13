-- 学祭ページを全員に開く（2026-11-13 所有者の指示: 店長以外も）。
--   「全員」ロールに「学祭」の権限を付ける。日をまたいだ売上（金額）はこれまでどおり「学祭2026」だけ。
--   外したくなったら、ロール管理の画面で「全員」の「学祭」を外す。
-- 再実行しても同じ状態になる（冪等）。ロールの変更を守るトリガーを通すため service_role として書く。
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.roles SET can_use_festival = true WHERE is_everyone AND NOT can_use_festival;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
