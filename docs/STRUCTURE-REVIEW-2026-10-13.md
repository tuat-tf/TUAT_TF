# ファイル構造と保守の複雑さの確認（2026-10-13）

## 開始・範囲

- 担当: Codex。所有者の「ファイル構造などが極めて複雑化しているが、問題ないか」への限定的な読取評価。
- 目的: ファイル数による見かけの複雑さと、変更・復旧・現行版の判断を難しくする複雑さを区別する。全面監査・再実装・移行の再開は行わない。
- 基準: fetch後の `origin/master` = `8566ce4`。元checkoutは `3dc1714` で22コミット遅れ、既存の変更・未追跡資料を保持。元checkoutへpullして既存変更と混ぜず、Git上の最新版と既存master worktreeを読み取る。
- 受入: アプリの責務分離、運用の経路、作業コピーと文書の管理を独立に確認し、具体的な根拠・改善順・未確認を回答する。行数だけで欠陥と判定しない。
- 保存・権限・復旧: コード、DB、認証、環境変数、依存、Jobs journal、mirror-state、稼働中サービス、既存worktreeは変更しない。変更は本記録と索引への追記のみ。

## 確認結果

保守・運用の複雑さには改善が必要。画面・取得・共通部品の基本境界は成立しており、今回の限定確認から全面再構成が必要とは判断しない。

### アプリの構造

- 最新masterの追跡ファイルは1,100、`src`は630（うちテスト144）、migrationは205。テスト・DB変更履歴・App Routerの入口を含むため、件数だけを不要コードの量と扱わない。
- コード評価には `D:/TUAT_TF/.worktrees/pc-folders-20261008` のmaster `8566ce4` を使用。このworktreeの既存変更は `docs/COMPETITION-MEETING-TIME-2026-10-08.md` のみで、`src`は最新版と一致。
- `src/app`、`src/components/ui`、`src/lib/queries`、`src/lib/supabase`の基本境界は合理的。ホームの独立取得は並列で、検索範囲では本番用libから画面・UIへの逆依存なし。根拠は最新版の `src/lib/queries/index.ts`、`src/app/(app)/home/page.tsx:68`。
- 旧OB戦と汎用大会処理が実行時に併存。最新版の `src/app/(app)/competitions/[id]/program/page.tsx:45–85` と `src/app/(app)/home/page.tsx:96–100` に分岐があり、表示・権限・更新の確認経路が増える。DB移行・旧入口の利用終了は今回未確認で、旧系の即時撤去は判断できない。
- `ProfileEditForm.tsx`はプロフィール保存のほか画像更新、シート設定、同期、ログアウトを担当し、変更時の確認範囲が広い。行数を理由に分割せず、次に触る責務を既存方式で分ける候補。`ScheduleSheetsManager`と`sheet-sync`には公開入口を維持した分割の良い例もある。

### 作業場所・文書・検証の境界

- 登録worktreeは76（root配下 `.worktrees` 67、`.contingency` 4、root自身1、外部4）。追跡ファイルのstatusを取得できた72のうち27に変更あり。外部4と全worktreeの未追跡だけの変更は未確認。
- 60のHEADはorigin/masterの先祖または同一、16は先祖ではない。ただしcherry-pickによる統合済みの可能性があるため、16を未統合とは断定しない。またHEADが統合済みでも未コミット・未追跡成果の安全な削除を意味しない。
- 調査開始時のrootは追跡変更73件、未追跡表示79件（ディレクトリは1件表示）。docsの未追跡ファイルは57。詳細規則・権限ガイド・統合履歴・最新作業記録にローカル保持があり、Gitだけでは復元できない。これは索引にも既定方針として明記されている。
- 現行索引・詳細索引・2本の統合履歴のローカルリンク188件にファイル欠損なし。アンカーは未検証。削除表示の旧文書には統合履歴があり、単純な損失とは扱わない。
- 全体ESLintの境界に具体的な不足を確認。rootのESLint API `isPathIgnored()` は `.worktrees/pc-folders-20261008/src/lib/permissions.ts` と `.contingency/pc-unified-worktree/src/lib/permissions.ts` の両方でfalse。Git上は作業コピーを除外しているが、全体lintの対象からは除外されていない。全体lint自体は起動していない。
- Vitestは `src/**/*.test.ts` に限定。TypeScriptは `.worktrees` を明示除外。`.contingency`の型検査への混入は今回実証していないため断定しない。
- `.gitignore`の `/.contingency/` はroot限定で、`ops/pc-rest-relay/.contingency/` と `ops/__pycache__/` は未追跡として表示。内部退避の内容は読んでおらず、秘密・実データの混入は未確認。一括addの対象境界を整理する候補。

### 運用構成

- 現行はVercel、クラウドAuth、PC/WSLの通常DB、Worker中継、R2、PC Jobsに分散。フォルダの移動だけでは依存先と復旧手順の複雑さを減らせない。根拠は [PC本番運用](../ops/laptop/PC-PRODUCTION-HANDOFF.md) の現行注記。
- PC停止中のクラウド書込みと復帰後の書戻しは最新版にも存在。`src/app/api/pc-supabase/[...path]/route.ts`、`src/lib/supabase/cloud-auth.ts`、`ops/laptop/cloud-mirror.mjs` が根拠。依存順、対象表、失敗履歴、上書き保護が必要となるため、運用複雑さの主要因。
- 10/9の閲覧専用予備への変更は方針であり、本番で完了したとは扱わない。UI/DBの書込み拒否を検証して有効化した後に、書戻し撤去を判断する。node_modules、WSL/DB、mirror-state、Jobs journalは保護対象。
- Linux/Cloudflareへの集約は別作業の候補。本記録から移行を再開しない。10/10 Surface記録末尾の所有者指示による終了・本番移行保留と、10/13統合記録の別担当による準備継続を区別する。

## 改善の順序

1. 現行master・本人用検証版・運用候補の場所と状態を短く明確にし、全体lintの対象を現行コードへ限定する。
2. 完了済み作業コピーを、未コミット・未追跡・稼働依存・保全先を確認した単位で整理する。一括削除は行わない。
3. 旧OB/共通大会の切替完了条件、予備閲覧専用化と書戻し撤去の条件を確定し、併存期間を終える。
4. 変更の機会に機能単位の配置・責務を整える。ファイル数削減を目的に独自共通層や全面再構成を追加しない。

## 終了・検証・未確認

- 最新master worktreeで既存Node.js 24.19.0を明示使用し、`check:environment`成功（直接依存35件がlock一致）。`tsc --noEmit --incremental false`成功、全Vitest144ファイル/1,232件成功。
- 初回Vitestはsandboxの一時キャッシュrenameがEPERMとなり、144suiteの収集前に停止・実行テスト0。コードの失敗と解釈せず、同じworktree・同じsuiteを通常権限で再実行して上記成功を確認。
- rootの既定 `npm run check:environment` はPATH先頭のNode.js 18.17.0と直接依存6件のlock不一致で失敗。最新版worktreeの正しい既存runtime/依存では成功したため、root環境の不一致とアプリの不具合を区別する。共有node_modulesやPATHの修復は行っていない。
- 本番の実操作・権限の実DB確認・PC停止/再起動/書戻し・外部連携・実機UIは今回未実施。型検査・合成テストの成功を実運用の保証にしない。
- 変更は本記録と `docs/README.md` の入口追記のみ。コード、DB、環境変数、本番サービス、既存worktreeは変更なし。commit・build・push・deployなし。既存の未コミット記録は保持。
