-- 学祭の機能はアプリから外した（2026-11-14 所有者の指示）。どのロールにも学祭の権限を残さない。
-- 表と売上のデータは消さずに残す（消すかどうかは別途判断）。
-- ロールの変更を守るトリガーを通すため service_role として書く。再実行しても同じ状態になる（冪等）。
DO $$
BEGIN
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  UPDATE public.roles SET can_use_festival = false, can_manage_festival = false
  WHERE can_use_festival OR can_manage_festival;
  PERFORM set_config('request.jwt.claims', '', true);
END $$;
