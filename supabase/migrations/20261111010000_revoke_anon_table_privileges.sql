-- ═══════════════════════════════════════════════════════════════
-- anon の表・ビュー・シーケンス権限を取り上げる（authenticated の TRUNCATE/REFERENCES/TRIGGER も）
-- ───────────────────────────────────────────────────────────────
-- 背景：20260624110000 は anon から表アクセスを外す意図だったが、本番では anon が public の
--   47表/ビューに INSERT/SELECT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER を持ち、authenticated も
--   TRUNCATE/REFERENCES/TRIGGER を持っていた（Supabase 既定の ALTER DEFAULT PRIVILEGES による）。
--   全表でRLSが有効で、ポリシーも authenticated 限定のため今は悪用できないが、多層防御として外す。
--   アプリは全画面でログインを要求し、anon が public の表を読む経路はない。
-- 方針：表・ビュー（ALL TABLES にビューも含まれる）・シーケンスの GRANT だけを対象にする。
--   anon が実行できる関数（check_login_access, backup_read_only など）には触れない。
--   authenticated の SELECT/INSERT/UPDATE/DELETE はRLSで守られているので残す。
--   今後 public に作る表・シーケンスにも再付与されないよう、作成ロールごとの既定権限も直す。
--   冪等。存在しないロールは飛ばし、権限不足は無視する（本番スタックでも素のテストDBでも通る）。
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  creator text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
  END IF;

  -- 既定権限は「作成ロール」ごと。migrationを流すロールと、Supabase が既定を仕込むロールを覆う。
  FOR creator IN
    SELECT rolname FROM pg_roles
    WHERE rolname IN ('postgres', 'supabase_admin') OR rolname = current_user
  LOOP
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon', creator);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon', creator);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated', creator);
      END IF;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'skip default privileges for role %: insufficient privilege', creator;
    END;
  END LOOP;
END $$;
NOTIFY pgrst, 'reload schema';
