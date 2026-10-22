# PC本番運用の引き継ぎ

## 最新注記（2026-10-22、下の旧記録より優先）

部活Cloudflare入口は https://app.tuat-tf.workers.dev 。稼働commitは `b5b045f222322cd839f6ed01061b738f6a2f9acd`。バックアップ保存先は部活Google Driveで、日次・オンライン採取へ変更済み。通常保存とJobsはバックアップの35分期限に依存せず、同一host/DBと120秒の心拍で可否を判定する。DB・認証・画像は引き続きこのPCの暗号化領域が正本。詳細・実検証・未整理の旧世代は [負荷修正記録](../../docs/BACKUP-LOAD-2026-10-22.md)を参照。下の15分/R2/旧公開URLや「Drive廃止」は過去構成の記録であり、現在値として使わない。

## 切替後の最新状態（2026-10-16、下の旧記録より優先）

現在の主系はPC内の暗号化WSL領域 `/var/lib/tuat-local`。アプリ・通常DB・認証・画像を集約し、入口は https://tuat-pc-app.track-app.workers.dev 。既存Googleの本人IDを維持し、本人ログイン・閲覧・プロフィール保存/再読込を確認済み。2026-10-16のいいね障害も修正し、実正本の本人投稿で追加・認証付き読戻し・取消が成功、元の全いいね行と件数・通知・他データの一致を確認した。

- 稼働releaseは `c6c2b019f891ab70a25755ee11995b1e5c58f2d2`、runtimeは `/etc/tuat-local/runtime.json`、SHA `20d20b7dc9549c7bfe38f0a479b72b67f502fe80ed9466cf5d6e0b7426f967ed`。現在のhost generationは `f8a815ab-962d-435a-9392-b5714701e890`（2026-10-15T23:28:58.660Z開始）。DB SYS `7696014892776206346`、postgres OID20613。元OID5は接続禁止で保持。
- Jobsは元のactivation/journalを保持して稼働。WSLの時刻補正でUTC起動時刻を誤判定する問題を、boot ID・process start ticks・同一systemd MainPID/cgroup・実FLOCKの安定照合へ修正した。定期処理稼働中のcombined backupと、自動timer実行の別DB復元・暗号化R2保存/読戻しも成功。15分timerはactive、同一世代のbackupReady/localSnapshotReadyはtrue。
- 旧PC/cloud source fence、旧cloud Data API off、旧relay retired503、旧Windows backend disabled、旧Jobs config=falseを維持。旧queue再送・書戻し再開をしない。Google Drive連携は所有者指示で廃止済み。
- 現在の公開codeはmasterへpush済み。旧Vercel入口のProduction成功と新旧両方の/api/versionの同一SHAを確認し、正式S4U常駐監視への引継ぎも完了。作業用watchは実プロセスを識別して終了し、正式監視のみで稼働維持を確認済み。iPhoneへの復号鍵保存・再表示全文一致は本人確認済み。OS再起動試験、スマホ実機での最終保存/PWA起動は未確認。
- 計画的にappを停止する前には、正式監視と独立した保全監視を先に維持する。正式監視はappの短い停止も異常として終了する。今回、正式監視終了後にWSLのサービスとmountが落ち、未公開backupが中断した。未検証archiveと元記録を暗号化領域へ保持してrefusedとし、新しい実行で正常復旧した。再試行・成功扱いで消していない。
- mountは作業用WSLプロセスだけでなく、PID1/systemdのmount namespaceから同じUUIDを確認する。callerだけのmountはConditionPathIsMountPointを満たさず、サービス起動がskipされる。既存mapperと同じ暗号化領域をPID1側へ接続して復旧済み。新ストレージ・別DBを作成していない。
- 新originのmanifest/SW/icon/offline配信は正常。旧Vercel originで作成したホーム画面アイコンは自動移管されないため、新URLをSafariで開き、共有→ホーム画面に追加で確認する。旧アイコンの削除は新アイコンの正常起動後。

正確な失敗・復旧・受入記録は [10/12集約作業記録](../../docs/PC-LOCAL-AUTH-IMAGES-2026-10-12.md) の末尾を読む。

移行の最新目標は[Linuxノート・Cloudflare無料化の並行計画](../../docs/SURFACE-SERVER-TRIAL-2026-10-10.md)。構成の複雑さ解消を最優先とする。以下は現行本番と過去の実施記録であり、Linuxへの移設・Vercel撤去を実施済みとは扱わない。

## 現在の構成（2026-09-27、下の旧運用記録より優先）

- ログインはクラウドSupabase、通常のデータはこのPC。ブラウザのRESTはCloudflare Worker経由。Vercelは画面・サーバー処理を担当する。
- PCのWSLデータは内蔵SSD `D:\WSL\Ubuntu`。既存WindowsタスクはS4Uで稼働。サインイン無しのOS再起動試験は未実施。
- 5分ごとにクラウドへ予備データを同期。名簿などは全件、練習記録などは直近3日。停止判定後はクラウド、復帰時に書き戻す。`cloud-mirror-status.json` で直近結果を確認する。
- 外部メール監視はオーナー判断で取りやめ。過去の「外部監視必須」を根拠に再開しない。
- 定期処理はPCの専用S4Uタスク `TUAT PC Jobs` へ移設済み（記録・大会・期限切れ整理の3本）。予定自動同期は取りやめ、Vercel cronは0件。検証結果は [9/27の検証](../../docs/OPERATIONS-2026-09-27.md)。古い隔離リリースを公開しない。
- 以下の「旧クラウドは凍結中」「9/16に全面復帰」は過去の説明。現在の予備構成に実行しない。

## 現在の読み方（2026-09-23更新）

本番は引き続きVercel＋Windows PCのWSL内Supabase＋非公開R2。以下の9月9〜16日の期間・旧instanceId・移行件数は初回切替時の記録であり、現在の接続先や停止期限として再利用しない。現ホストは `control-backend.mjs status` と `audit-backend.mjs` で確認し、秘密値を出力しない。同名の別PC環境を本番とみなさない。

- 9月21日にPushのVault・鍵・送信経路を修復し、復旧設定込みの暗号化バックアップとR2保持処理を専用中継の再起動で運用反映済み。下の「Web Push未移行」は過去の記録。端末での購読・受信確認は別途必要。
- アプリ内通知の定期確認は表示中の2分間隔。外部メール監視は実装作業とGoogle認可・稼働確認を区別する。最新状態は [監査](../../docs/AUDIT-2026-09-21.md) を参照。
- 旧クラウドは凍結中。大会記録などPC側に追加したスキーマを無視し、昔の期限やコマンドを根拠に自動復帰しない。[復帰条件](RETURN-TO-SUPABASE.md)を確認する。
- 最新のコード変更・検証は [AGENTS](../../AGENTS.md) と [文書案内](../../docs/README.md)。最新Vercelデプロイとホストの実状態はその都度読み取り確認する。

## 初回切替の記録（2026-09-09〜10）

2026-09-10更新: 所有者は旧クラウドの更新を後回しとし、9/17以降に別PCをサーバー化する予定。大会記録v2のmigration 20260909010000/20260910010000はPCのみ適用済み。旧クラウドへの試行は接続切断でロールバックされ、列なし・履歴0件・凍結維持を読み取り確認済み。元の復帰手順はスキーマ不一致のためそのまま実行できない。復帰準備の追加実装は依頼されていない。9/16 15:00の停止期限は変更していない。

**この文書が過去の「本番未変更」「本人限定試験」「承認待ち」の記録に優先する。** Claudeや別端末のCodexは最新origin/masterとこの文書を最初に読む。

## 本番と期間

- URL: **https://tuat-tf.vercel.app**。アプリはVercel、DB/AuthはこのWindows PCのWSL Ubuntu、画像は非公開R2。
- 運用期間: **2026-09-09 15:00〜2026-09-16 15:00 JST**。所有者が実ログイン成功を報告。こちらではログイン画面、Google/大学認証への遷移、Auth API 200を確認。全員の実機操作は未確認。
- Vercel `tuat-tf` / `prj_fLc2aGQHb2Ny4IMt21ESzN0ij25p`。初回PC本番デプロイ `dpl_EC7B7nTfWUBHVQFbTXgFsLFoEorS`。最新デプロイはVercelで確認する。
- 元のSupabase `snbgxocgdhqtuywrlqrs` は**アプリ/Auth identity書き込み凍結中、旧cron 2本も停止中**。PCが唯一の書き込み先。
- 最新クラウドから45対象テーブルを移し全行一致を検証。プロフィール65人、既存Auth/Google identityを保持。試験アカウントは削除済み。通常の大学Googleアカウントで再ログインする。
- `tuat-tf-pc-preview.vercel.app` と古いCloudflare試験URLは案内しない。本人限定の試験プロセスは終了。本番は通常の部員認証。

## 起動と接続

Windowsタスク **TUAT PC Backend Temporary** → `backend-task.ps1` → WSLのDockerと `run-backend.mjs` を起動する。所有者のWindowsログイン中に動作し、タスク終了時は1分間隔で再試行。中継心拍が150秒止まれば対象プロセスを再起動する。古い子プロセスの回収と親タスク終了検知を実装済み。

Vercel `/api/pc-supabase` → R2の署名付き・180秒有効の接続先 → Cloudflare Tunnel → `127.0.0.1:3109` の専用キー付きゲート → `127.0.0.1:8000` のSupabase API。JWT署名とRLSはSupabaseが検証する。DBやStudioを公開しない。

画面は消してよい。タスクが自動スリープを抑止するが、電源断・手動スリープ・サインアウト・再起動は停止要因。9月9日に蓋閉じのAC/DC設定が両方「何もしない」であることを確認した。電源につなぎ、放熱を妨げず運用する。蓋閉じ後の実機継続稼働は未確認。

このPCのリポジトリで使うコマンド:

```powershell
node ops/laptop/control-backend.mjs status
node ops/laptop/audit-backend.mjs
powershell -NoProfile -File ops/laptop/runtime.ps1 status
powershell -NoProfile -File ops/laptop/restart-backend.ps1
```

最後のコマンドだけ再起動を行う。タスクを一時無効化して競合を防ぎ、実行ファイルと親PIDを照合した当アプリの中継だけ停止する。DB/他アプリは保持。全Node終了、WSL全停止、Docker volume削除はしない。

ログは `.contingency/backend/` の `runtime-status.json`、`backup-status.json`、`task.log`、`task-error.log`、`task-restarts.jsonl`、`runtime-start-error.log`。状態確認スクリプトは秘密や部員データを表示しない。Auth 200まで確認し、プロセス生存だけで正常と扱わない。

Wi-Fi変更時は中継先を再取得してR2へ署名保存するため、利用者URLやGoogle設定の変更は不要。Quick Tunnelには稼働保証がなく、再接続中は通信できない。McAfeeの不要なVPN経路は解除後に疎通確認済み。ウイルス対策/Firewallは無効化していない。WSLはmirrored networking、DNS tunneling、firewall有効。Dockerのサブネットはテザリングとの重複を避けている。

## DBの置き場所（2026-09-26更新）

WSL Ubuntu（DB/Authのコンテナを含む）の仮想ディスクは **内蔵NVMe SSDの `D:\WSL\Ubuntu\ext4.vhdx`**。9/17〜9/26は外付けHDD(E:)に置いていた。移設前の複製は `E:\WSL\Ubuntu-pre-ssd-20260926\`。下の節の「外付けHDDからの初回起動は遅い」は移設前の記録。

中継（run-backend.mjs）は `D:\TUAT_TF\node_modules` の依存（@aws-sdk など）を読み込む。空にすると、次に再起動した時点で本番が止まる。

## 再起動すると止まる（2026-09-21 実際に起きた）

> **2026-09-26更新**: 下の手順2（`install-backend-task.ps1 -WithoutLogon`）を所有者が実施し、本番タスクはS4U（ログオン不要）になった。ログインせずに再起動して復旧するかの実試験は未実施。

2026-09-20 23:20にPCが再起動し、翌朝05:40に所有者がログインするまで**約6時間25分、本番のDB/Authが停止した**。
アプリ（Vercel）は生きているのでログイン画面は開くが、その先が全部失敗する。

原因は2つ。

1. **起動タスクが `LogonType=Interactive`** で、所有者のデスクトップセッションの中でしか動かない。
   再起動後は誰かがログインするまで自動では戻らない。
2. ログイン後の最初の2回の起動も失敗していた。**外付けHDDからの初回起動は遅く、DBの準備を待つ
   `supabase-storage` が一度 unhealthy に倒れる**。`compose up --wait` はその瞬間に諦めるため
   `runtime.ps1 start` が例外を投げ、`backend-task.ps1` が中継を起動する前に終了していた。
   1分ごとの再試行に救われて3回目で起動した。

2の方は修正済み（`runtime-wsl.sh`）。`--wait` が早々に諦めたら、そこで終わらせず実際に回復するかを
最大420秒見届ける。`sh runtime-wsl.sh wait [秒]` で単独でも使える。

1の方は**管理者権限が要るので所有者の操作が必要**。順番は次のとおり。

```powershell
# 1. まず確かめる（本番のタスクには触らない。読み取り専用の別タスクを作って消すだけ）
powershell -NoProfile -File ops/laptop/check-logon-free-start.ps1

# 2. 「届いています」と出たら本番タスクを切り替える（パスワードは預けないS4U方式）
powershell -NoProfile -File ops/laptop/install-backend-task.ps1 -WithoutLogon

# 元に戻すときはスイッチ無しで同じコマンド
powershell -NoProfile -File ops/laptop/install-backend-task.ps1
```

1で「届きませんでした」と出た場合は、WSLがデスクトップの無いセッションから使えない構成なので、
**自動ログイン**（電源投入で自動的にサインインさせる）に切り替える。Windows 11 HomeではHyper-Vの
常駐VMが使えないため、この2つが現実的な選択肢になる。

切り替えると中継が一度作り直されるので、**部員が使っていない時間に実行する**（30秒程度）。

## 秘密情報と保存先

- 本番機 `C:\Paimon Dayo\TUAT_TF`、WSL `Ubuntu`、`/opt/tuat-tf-supabase`、Docker project `tuat-contingency`。
- `.contingency/backend/config.json`: bridge/暗号鍵、期間、maintenance。**表示・Git追加禁止**。
- `.contingency/backend/google-oauth.env`: Google秘密鍵。**本番中に configure-backend-auth.mjs --preview を実行しない**。全員のcallbackが変わる。
- `.contingency/local-app.env`: PC側の独立キー。`.env.local` は元のクラウド設定のまま。これを使った開発をPC本番操作と取り違えない。
- Vercel Productionに承認済みPCサーバーキー/R2設定を保存済み。秘密鍵をNEXT_PUBLIC_に置かない。一般のPreviewへ本番秘密設定をコピーしない。
- `.contingency/backend/production-rollback-env.json`: 復帰用クラウド設定。データを戻す前に適用しない。
- WSL `/opt/tuat-tf-supabase/transfer/`: `cloud-frozen-final-20260909.jsonl`、PC移行前後のスナップショット、`cutover-applied.json` 等。生データはGitに含めない。

## バックアップと復帰

public/auth/storageを15分ごとにダンプし、AES-256-GCM暗号化後、所有者のR2 `tuat-tf-images` の `ops/pc-backend/a629d00c-159e-4b0e-8543-50b34dce9dba/backups/` へ保存。PUT/HEAD・サイズ・ハッシュを検証し、35分以上検証済みバックアップがなければ保護停止。起動直後もバックアップする。ダウンロード・復号・別DB復元を検証済み。

復号鍵はR2へ保存しない。config.jsonにあり、元のクラウドservice-roleキーから `SHA256("tuat-pc-backup-v1\0" + originalKey)` で再現可能。復旧前に元の鍵を破棄/無計画に更新しない。別端末への秘密情報の受け渡しは所有者の安全な経路で行い、チャット/Gitへ貼らない。

復帰は **[RETURN-TO-SUPABASE.md](RETURN-TO-SUPABASE.md)**。新規だけでなく編集/削除も戻す。基準行比較とFK整合、不一致時の全体ロールバックを別DBで検証済み。managed Supabaseへの最終逆移行は当日の検証が必要。期限後はPCゲートが保護停止し、古いクラウドへ自動接続しない。

Codexのこのタスクに9月16日14:30 JSTの復帰作業再開を登録（`tuat-pc-supabase`）。PC/アプリ/認証が利用できなければ自動作業を保証できないため、他エージェントも期限を把握する。

## 検証と残事項

- 209 Vitest、専用ゲート/暗号化2テスト、TypeScript、対象ESLint、PC設定Next build成功。本番でも匿名・偽造JWT・管理API・外部Origin・直接中継アクセスの拒否を検証。
- 日本語エラーにUTF-8を明示。バックアップ処理と中継心拍を分離し、同期的なACL操作に上限時間を設けた。
- 写真はR2。アプリ内通知は30秒ポーリング。Vercel cronへ記録同期（JST 0:00）と予定同期（毎時05分）を移行。初回の自動同期ログは別途確認する。
- **Web Push未移行**: 既存VAPID秘密鍵がこのPCにない。勝手な鍵の再生成は全部員の再購読を必要とするため行っていない。正規に鍵を回収してPC Functions/Webhook/外向き通信を設定するか、クラウド復帰後の元の経路を使う。過去の通知の一括再配信や無断の全部員テスト通知をしない。
- OS再起動/別Wi-Fiへの変更/蓋閉じ後/スマホ全機種の実動作は未確認。Quick TunnelとPC電源に依存し、無停止保証はない。

## 別端末からの作業

コード修正・テスト・レビューは最新masterで可能。DB/Auth/復帰/トンネル/秘密鍵変更はこの本番PCで状態を確認して進める。別PCの同名ディレクトリは本番データではない。別端末から本番PCを操作する仕組みは用意していない。

一時運用中にスキーマを変更すると基準差分転送が拒否される。両側の整合と復帰計画を先に見直し、比較ガードを削除して通さない。クラウドにdb pushしてPCへ反映済みと扱わない。複数エージェントでDB/環境変数/デプロイを同時変更しない。最新masterへ統合し、Vercel READYと本番URLを確認して引き継ぐ。

## 2026-10-16 21:48 JST 再起動後の復旧（起動処理の最新追記）

旧backup-owner.lockの残存による起動失敗を実確認し、旧PID不在とhost lifetime FLOCK取得後に元lockを暗号化privateへ保全して正式S4Uから復旧。公開app 4051ea1、Jobs、timer、正式watch、新世代backupのR2読戻し/別DB復元を確認。正式bootstrapとWindows pinへ停止ownerだけの保全復旧を適用済み。業務履歴の再送・旧writer復活なし。OS再起動の再試験は未実施。詳細: docs/REBOOT-RECOVERY-2026-10-16.md。
