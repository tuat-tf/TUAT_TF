# AGENTS.md — 現行アプリの作業入口

更新: 2026-10-20。新しい所有者指示を優先する。詳細は必要な節だけ読む。

## 読み始め方

- 今回の依頼・git status・対象コードから始め、必要な文書だけ[索引](docs/README.md)で選ぶ。履歴全文や全監査を毎回読まない。
- 検証版・未公開版を含む開発基準と元成果の採否は[一本化記録](docs/UNIFIED-DEVELOPMENT-2026-10-20.md)を参照する。旧作業コピーの続きを別系統として再開する前に、統合版との差分を確認する。
- コード変更は[詳細規則](docs/DEVELOPMENT-RULES.md)の「実装の基本」、公開は「完了の定義」、DB/認証/PC運用は「認証・本番PC・予備構成」を着手前に読む。UIは[UI規約](docs/UI-UNIFICATION.md)・[文言](docs/WORDING-GUIDELINES.md)の対象節、権限は[権限ガイド](docs/PERMISSIONS.md)を確認。
- rgで対象ファイル・見出し・範囲を絞る。同じ会話で確認済みの資料は変更箇所だけ再確認。ツール出力は要点・失敗箇所に絞る。
- 委任は独立作業に絞り、担当ファイル・前提・受入条件を渡す。会話全文の複製・同じ調査の重複を避け、小修正で全体監査を再開しない。
- 日付ログの「承認待ち」「未実装」・古い期限は当時の状態。最新指示・コード・終了追記を照合し、実装済み機能を作り直さない。

## 常に守ること

- 最新origin/masterを基準に、既存変更・未追跡を保全してpullする。独立worktreeはfetch後に開始。divergeは最新masterへ自分の差分を載せ直す。既存変更を戻さず、force-pushしない。
- 担当ファイル/worktreeを分離。本番DB・環境変数・デプロイは担当一本。同名の別ローカルDBを本番PCの検証にしない。
- 作業ブランチはpushせず、関連変更を検証・master統合後に1回だけpush。文書のみはローカル保持し、build/deploy/pushしない。
- 全体品質改善は本人用検証を先行し、公開保留を維持。個別公開指示を他作業へ流用しない。隔離は別origin・セッション・DBとし、本番共有の別URLを隔離と呼ばない。
- Vercel設定は具体的変更の所有者承認が必要。費用削減への同意を設定/課金変更の承認にしない。
- migrationは新時刻で追加し冪等にする。本番初回のmigration/同期/一括更新は対象・履歴・内容を確認し、対象表snapshotとdryRunを必須にする。
- 秘密・実データ退避・未解決の攻撃手順は公開Gitへ入れず、秘密をログ/報告に出さない。本番依存・サービスを検証準備で止めない。
- コミット末尾は `Co-Authored-By: Codex <noreply@openai.com>`。他AIを名乗らない。

## 実装と検証

- 修正前に操作を再現し、目的・一連の受入条件・データ/権限保持・失敗後の復旧を短く記録。未再現なら推測と明示。不要な機能・警告・設定・独自共通層を増やさない。
- 取得失敗を0件/未登録/404へ変換せず、重要な更新・削除は対象件数を確認。未保存・部分保存・競合・結果不明を扱い、結果不明の保存を無条件で再送しない。
- Next16/React19/Tailwind4/Supabase。コード前に同梱node_modules/next/dist/docsの該当ガイドを読む。初期取得はServer Componentと@/lib/queries、操作はClient Component、独立取得は並列。
- 本人IDは検証済みgetClaims().claims.sub / getUser().user.id。cookieの未検証userを信用しない。UIはpermissionsOf、DBはRLSで複数ロールをOR判定。UIだけで権限を広げない。
- check:environment、tsc、対象eslint、全Vitest、必要な運用/DB/UI確認。buildはpush直前。公開は対象PC releaseのcommit SHAと本番/api/versionの一致まで確認。Vercel側も更新する場合はProduction READYと同じSHAを確認。
- 完了報告はできる操作・確認方法・未確認・本番反映を先に示す。件数や合成ブラウザを実機・運用の証明にしない。

## 維持する境界

- 主系はPC内の暗号化WSL領域へ集約したアプリ・DB・認証・画像。公開入口はCloudflare、旧Vercel URLとPC外の暗号化バックアップは残る。変更前に[PC本番運用](ops/laptop/PC-PRODUCTION-HANDOFF.md)の最新注記と対象作業の終了追記を読む。ソース統合・検証版・本番反映を区別する。
- 持ち出せるLinuxノートへの移設でも正本/書込み先/定期処理を一つにし、既存クラウドの役割と撤去条件を整理する。Vercel常用・旧URL維持を最終条件にせず、既存の受入条件と未確認を引き継ぐ。現行とほぼ同じ通常操作の一連の試験を条件とした既存の移行承認は、その対象と受入条件に限る。不具合・主要操作の未確認が残る構成は切り替えない。[Linux・Cloudflareの計画と受入条件](docs/SURFACE-SERVER-TRIAL-2026-10-10.md)
- 旧PC/cloud source fence、旧cloud Data API off、旧relay retired503、旧Windows backend/Jobsの無効状態を維持する。旧queue再送・予備への書込み・復帰時の書戻しを再開しない。端末内送信待ちも不採用。15分バックアップ、別場所への暗号化保存と完全性/復元検証を保護し、削減・整理のために単純停止しない。[構成の簡素化の経緯](docs/ARCHITECTURE-SIMPLIFICATION-2026-10-09.md)
- D:\TUAT_TF\node_modules、WSL/DB、mirror-state、Jobs journalを保護。全Node終了・WSL停止・Docker volume削除を通常テストにしない。一時失敗だけで有効な認証cookieを消さない。
- cacheComponents / experimental.staleTimesは再導入禁止。PullToRefreshを方式変更だけで復活させない。東京hnd1・React Query・loading・診断記録を維持し、Tab Labを戻さない。
- ガラスは全員の標準、下部タブは直接透過。旧opt-in/背景画像化を戻さず、いいね・コメントは控えめな装飾。実装/公開状態は最新UI記録で照合。
- 休止中のD:\TUAT_TF_NEXT_PAUSED、外部メール監視、予定自動同期、旧登録承認ゲートを再開しない。GAS旧合体版は保持。ダークモード・記録/つぶやきの永続オフライン下書き・コメント@メンションは明示指示なしに追加しない。
- 作業記録は対象の日付文書1本へ開始/終了を追記し索引へ追加。AGENTSへ日付ログを積まない。[AGENTS保存履歴](docs/history/AGENTS-2026-10-02.md)は書き換えず、既存未コミット記録も保全。
