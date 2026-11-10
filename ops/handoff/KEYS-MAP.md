# 鍵・秘密の地図（人間向け）

2026-11-08作成。値は一切書かない。「何が・どこにあり・なくすと何が困るか」だけを書く。
詳細な復旧手順は [README](README.md)、項目の正式な一覧は [SETTINGS](SETTINGS.md)。

## 1. 最重要：なくすと取り返せないもの

| もの | 本番PC上の場所 | PCの外の控え | なくすと |
|---|---|---|---|
| バックアップ復号鍵（32byte、`PC_BACKUP_ENCRYPTION_KEY`） | `/var/lib/tuat-local/private/installation-<現行>/recovery-backup.key` ほか（`runtime-backup.key` と同じ値。2026-10-14以降変わっていない） | 管理者個人のパスワードマネージャー（iPhoneの「パスワード」、2026-11-08）。ほかに、下の「iPhoneのマスター鍵」で暗号化した復旧パック `20d29a1e`（旧R2）にも入っている | Google Driveの暗号化バックアップが**すべて開けなくなる**。PCが壊れたら復旧不能 |
| iPhoneのマスター鍵（2026-10-12作成、64文字、iPhoneの「パスワード」に保存） | PCには置いていない | iPhoneだけ | 復旧パック `20d29a1e` などが開けなくなり、上の復号鍵をPCの外から取り戻す手段がなくなる |
| Auth/RESTのJWT署名鍵（`GOTRUE_JWT_SECRET`、`PGRST_JWT_SECRET`、`local-jwks.json`） | `auth.env`、`rest.env`、`/var/lib/tuat-local/rest-private/local-jwks.json` | 暗号化した復旧支援パック（Drive）の中 | 作り直すと全員のログインが切れる。復旧パックが開ければ戻せる |
| DB Vault鍵（`pgsodium_root.key`） | `/var/lib/tuat-local/db-private/pgsodium_root.key` | 同上 | DB内で暗号化して保存している値が読めなくなる |

→ PCを失ったときの復旧経路は「iPhoneのマスター鍵 → 旧R2の復旧パック `20d29a1e` を復号 → バックアップ復号鍵 → Driveのバックアップを復号」の三段。旧R2は個人側の保存先で、部活へ移していない。2026-11-08からはバックアップ復号鍵そのものの控えもiPhoneにあるので、この遠回りは予備の経路。

## 2. 現在使われている設定ファイル

`/etc/tuat-local/runtime.json` が指している現行のもの（WSL内、暗号化領域）。

| ファイル | 中の秘密（名前のみ） | 何のため |
|---|---|---|
| `private/installation-<現行>/application.env` | `SUPABASE_SERVICE_ROLE_KEY`、`CRON_SECRET`、`SHEET_SYNC_SECRET`、`LOCAL_IMAGE_SIGNING_KEY`、`VAPID_PRIVATE_KEY`、`GOOGLE_TOKEN_ENCRYPTION_KEY`、`NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` | アプリ本体、画像署名、通知、シート連携 |
| `private/db.env` | `POSTGRES_PASSWORD` | DB |
| `private/installation-92e8b09/auth.env` | `GOTRUE_JWT_SECRET`、`GOTRUE_EXTERNAL_GOOGLE_SECRET` | ログイン（Googleログインの秘密を含む） |
| `private/rest.env` | `PGRST_JWT_SECRET` | DB API |
| `private/installation-<現行>/offsite.env` と `offsite.json` | `PC_BACKUP_ENCRYPTION_KEY`、DriveのOAuth client/token | Google Driveへのバックアップ |
| `private/tunnel.token`、`tunnel.json`、`club-tunnel/token` | Cloudflare Tunnelの接続資格 | 公開URLとPCをつなぐ |
| `private/luks-unlock.key` | 暗号化領域の鍵 | WSL暗号化領域の解錠（起動時はWindows側の保護された設定から解錠） |

パスはすべて `/var/lib/tuat-local/` 以下。

## 3. サービスの管理アカウント（ファイルではないもの）

| サービス | 管理主体 | 役割 |
|---|---|---|
| Google（部活Gmail） | 部活 | Drive（バックアップ保存先）、Google Cloud（ログイン用OAuth）、GAS |
| GitHub `tuat-tf` | 部活 | ソースコード |
| Cloudflare | 部活（アカウントID `f08f553737bd866b3a6f4ce1f94a8be3`、部活Googleでログイン） | 公開URL `app.tuat-tf.workers.dev`・Tunnel |
| Vercel（管理者の個人アカウント） | 個人 | `tuat-tf.vercel.app`（最初の旧URL）が新URLへ転送している。`tuat-tf-pc-preview` は404で使われていない。ほかに部活以外かもしれない `shinkan2026`・`menu20260404`・`article` がある。整理は所有者の承認が要る。 |
| Cloudflare（管理者の個人アカウント） | 個人 | 旧URL `tuat-pc-app.track-app.workers.dev` だけが残る。2026-11-11から、開くと「URLが変わりました。11月18日で使えなくなります」の案内と新URLへのボタンを出す（画面以外の読み込みは新URLへ転送）。**2026-11-18に削除する。**ほかの旧Worker 3つは2026-11-11に削除した。秘密は持っていない。同じログインで見える「TUAT TF」アカウント（`a0088e…`）は空。 |

各アカウントのパスワード・2段階認証の復旧手段は、本人回答では「復号鍵以外は取り出せる見込み」。後任へ渡したことはない。

## 4. 整理が必要なところ（見つかった問題）

1. **暗号化領域の外の平文コピーは削除済み（2026-11-09）。** 2026-11-08に指紋（SHA-256）だけで本番の現行の秘密と照合して仕分け、次を削除した（約7.3万ファイル・約13GB）。
   - 現行の本番の秘密の平文コピー28ファイル（バックアップ復号鍵を含む `backend/config.json` など）。
   - 部員の個人データの平文（ログイン利用者の書き出し、部員データ、権限の書き出しなど）。
   - 旧版のコピー・旧スクリプト・ログ（`retired-releases-20261022`、`upstream` など）。
   - `D:\TUAT_TF\.env.local` と `.worktrees\pc-folders-20261008\.env.local`（中身はすべて旧クラウドSupabase・個人側R2・旧Vercel用）。
   - **残っているもの**: `.contingency/pc-auth-source-private-20261012/linux-storage-20261013/`（約0.5MB）。中の `windows-bootstrap-20261014/` はWindows起動タスク「TUAT Local Runtime」が `windows-boot.mjs`・`windows-boot.json` を実行する場所で、暗号化領域の解錠鍵（`luks-key.machine.dpapi`）もある。消すとPCを再起動したときに本番が起動しない。同じ階層の `luks-key.dpapi`・`luks-key.recovery.enc` は解錠鍵の別の控えなので一緒に残した。
   - 読み取りも拒否される権限だった3ファイル（`backend/ob-*-pc-before.json` 2つ、`import-timeline-20261005/workspace-before.patch`）は、2026-11-11に管理者のPowerShellで権限を戻して削除した。
   - **旧サービス（2026-11-11）**: 旧クラウドSupabaseのプロジェクト（`snbgxocgdhqtuywrlqrs`、個人アカウント）を削除した。個人側R2のアクセスキー `tuat-tf-images-production` とバケット `tuat-tf-images`（古い画像と復旧パック）を削除した。削除前に、今のDBが使う画像72件がすべてPCにあることを確かめた。これで復旧パック `20d29a1e` と「iPhoneのマスター鍵」は使い道がなくなった。
   - タスク「TUAT PC Jobs」（旧Jobs）は2026-11-11に無効化した。
2. **同じ鍵のコピーが多い。** 本番反映のたびに複製される。2026-11-11に `pc-release.py prune --keep 2 --execute` で古い版42世代（約47GB）を片付け、`installation-*` は34世代に減った（残りはpruneの対象外）。暗号化領域内なので直ちに漏れるわけではない。
3. ~~復号鍵のPCの外の控えが旧R2に依存~~ → 2026-11-08に直接の控えを作成済み。

## 5. 次にやること（候補）

- [x] バックアップ復号鍵そのものの控えを作る（2026-11-08、iPhone）。鍵を作り直してはいけない。控えを作り直すときも下のスクリプトを使う。
  本番PCのPowerShellで `powershell -NoProfile -ExecutionPolicy Bypass -File D:\TUAT_TF\ops\handoff\show-backup-key.ps1` を本人が実行する。鍵は画面にだけ表示され、保存後に控えを入力し直して一致を確認する。ファイルやチャットには残さない。
- [ ] 後任へバックアップの鍵を渡す方法を決める（今は管理者個人の控えだけ。候補は部活Googleアカウントのパスワードマネージャー。Driveのファイルには置かない）。
- [x] `.env.local` と `.contingency` の中の秘密を仕分ける（2026-11-08、上の1）。
- [x] 仕分けた不要物を削除する（2026-11-09、起動に使うフォルダは残した）。
- [x] 消せなかった3ファイルの削除と、タスク「TUAT PC Jobs」の無効化（2026-11-11、管理者のPowerShell）。
- [x] 旧クラウドSupabaseを削除、個人側R2のアクセスキーを削除（2026-11-11）。
- [x] 個人側R2のバケット `tuat-tf-images` を削除する（2026-11-11、本人が実施）。
- [ ] 起動用のファイルを `.contingency` から安定した場所へ移す（管理者権限が必要）。
- [x] 古い世代を `pc-release.py prune` で片付ける（2026-11-11、42世代・約47GB）。
- [ ] 各サービス管理アカウントの復旧手段を後任へ渡す方法を決める。
- [ ] 2026-11-18に個人Cloudflareの `tuat-pc-app`（旧URLの案内）を削除する。
