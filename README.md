# TUAT T&F

陸上競技部向けの練習記録・予定・出欠・大会結果・ノート共有アプリ。Next.js 16 / React 19 / Supabase / Tailwind CSS v4 を使用する。

本番はCloudflareの公開入口から所有者PCへ接続し、アプリ・DB・認証・非公開画像をPC内で運用する。PC外には暗号化バックアップを保存する。旧クラウドへの業務データの切替・書戻しは再開しない。公開入口と稼働状態は [PC本番運用](ops/laptop/PC-PRODUCTION-HANDOFF.md) の最新注記を優先する。

検証版・未公開版を含む開発基準は `codex/unified-development-20261020` に集約した。所有者PCの作業場所は `D:\TUAT_TF\.worktrees\unified-development-20261020`。取り込み元・採否・検証と公開保留の範囲は [一本化記録](docs/UNIFIED-DEVELOPMENT-2026-10-20.md) に記載する。元の作業コピーは履歴保全用であり、この統合版を今後の変更の土台にする。

開発ルールと完了条件は [AGENTS.md](AGENTS.md)、運用は [PC本番運用](ops/laptop/PC-PRODUCTION-HANDOFF.md)、文書全体は [文書案内](docs/README.md) を参照する。

## 開発環境

ルートディレクトリが現行アプリ。新アプリは `D:\TUAT_TF_NEXT_PAUSED` へ移して休止中。オーナーの明示指示なしに再開せず、現行アプリのビルド・lint・テストへ混ぜない。

1. Node.js 22.12以降（この変更は24系で検証）を用意する。
2. `npm ci` でロックファイルに合わせて依存を導入する。
3. [.env.example](.env.example) を参照して、開発先に対応した `.env.local` を用意する。Supabase、Googleログイン、画像、通知、同期の設定は別々で、最初の4変数だけで全機能が動く構成ではない。秘密値はGitやログへ出さない。
4. `npm run dev` を実行し、`http://localhost:3000` を開く。

独立した検証DBを新規構築する場合、スキーマは `supabase/migrations/` の履歴を基に準備する。既存のCLIリンクや `.env.local` が現在の本番DBを指すとは限らない。DB変更は対象接続先・バックアップ・dry-run・適用履歴を確認してから行う。現在のPC本番に対する手順を、新規クラウドプロジェクト向けコマンドで代用しない。

GoogleログインにはAuthプロバイダーとコールバック設定が必要。権限は `roles` と `profile_roles` の複数ロール方式で、アプリのロール管理とDBのRLSにより制御する。

## 確認コマンド

| コマンド | 用途 |
| --- | --- |
| `npm run dev` | ローカル開発 |
| `npm run check:environment` | Node.js・直接依存の実バージョンをロックファイルと照合（読取のみ） |
| `npm test` | 現行アプリのVitest |
| `npm run test:tooling` | 開発環境診断の合成テスト |
| `npm run test:ops` | バックアップ・予備同期・GAS・ガラス描画の合成テスト |
| `npm run test:ops:integration` | ループバックHTTPを使う中継・定期処理の合成テスト |
| `npx tsc --noEmit` | 型検査 |
| `npx eslint <変更ファイル>` | 変更箇所のlint |
| `npm run lint` | リポジトリのlint（既存の指摘も含む） |
| `npm run build` | 現在の環境設定でビルド |
| `npm start` | ビルドしたアプリを起動 |

検証前に `npm run check:environment` を実行する。package.jsonが新しくても、実行中のNode.jsや既存node_modulesが古い場合がある。診断は自動インストールや本番への通信を行わない。運用の実行スクリプトをテスト代わりに起動しない。

本番のrelease作成・起動は [PC hostの手順](ops/pc-host/README.md) と最新の運用記録に従う。古いビルドスクリプトや同名フォルダを、本番と同じ構成だと判断して起動しない。

## 本番反映

全体品質改善の公開保留を維持する。公開時は [完了の定義](docs/DEVELOPMENT-RULES.md#完了の定義) に従い、最新masterへ統合してbuild・pushし、PC releaseと公開 `/api/version` の対象SHA一致まで確認する。Vercelも更新する場合は同じSHAのProduction READYを確認する。Vercelの設定変更には別途具体的な承認が必要。東京リージョン `hnd1` を維持する。

一般Previewへ本番のDB/管理キーを複製しない。デプロイ・DB・環境変数の同時変更を複数担当で行わない。

## 実装の要点

- 初期取得はServer Componentから `@/lib/queries` を呼ぶ。実体は `src/lib/queries/` の機能別モジュール。
- 互いに依存しない取得は並列化する。自分のIDだけで引けるデータはプロフィール取得を待たない。
- ホームは見出しと共通スケルトンを先に出し、本文を一括表示する。外部シートのメニューは予定を開いたときに取得する。
- 軽い操作はローカルstateで即時反映し、保存後の整合はサーバーの取得結果と合わせる。
- `cacheComponents` と `experimental.staleTimes` は再導入しない。過去のiOS PWAフリーズの経緯はAGENTSと `next.config.ts` のコメントを参照する。
- UI・文言の詳細は [UI統一](docs/UI-UNIFICATION.md) と [文言規約](docs/WORDING-GUIDELINES.md) に集約する。
