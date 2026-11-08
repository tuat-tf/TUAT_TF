# 鍵・秘密の地図（人間向け）

2026-11-08作成。値は一切書かない。「何が・どこにあり・なくすと何が困るか」だけを書く。
詳細な復旧手順は [README](README.md)、項目の正式な一覧は [SETTINGS](SETTINGS.md)。

## 1. 最重要：なくすと取り返せないもの

| もの | 本番PC上の場所 | PCの外の控え | なくすと |
|---|---|---|---|
| バックアップ復号鍵（32byte、`PC_BACKUP_ENCRYPTION_KEY`） | `/var/lib/tuat-local/private/installation-<現行>/recovery-backup.key` ほか（`runtime-backup.key` と同じ値。2026-10-14以降変わっていない） | 管理者のiPhoneの「パスワード」（2026-11-08に本人が保存）。ほかに、下の「iPhoneのマスター鍵」で暗号化した復旧パック `20d29a1e`（旧R2）にも入っている | Google Driveの暗号化バックアップが**すべて開けなくなる**。PCが壊れたら復旧不能 |
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
| Cloudflare | 部活 | 公開URL・Tunnel |
| Vercel | 未整理 | 旧URL。主系ではない |

各アカウントのパスワード・2段階認証の復旧手段は、本人回答では「復号鍵以外は取り出せる見込み」。後任へ渡したことはない。

## 4. 整理が必要なところ（見つかった問題）

1. **暗号化領域の外に秘密の平文コピーがある。** 2026-11-08に指紋（SHA-256）だけで本番の現行の秘密と照合して仕分けた。`D:\TUAT_TF\.contingency\` は約7.2万ファイル・約14GB。
   - **現行の本番の秘密が入っている（28ファイル）**: `.contingency/backend/config.json`（**バックアップ復号鍵**）、`backend/pc-jobs-*.env`（`CRON_SECRET`・`SHEET_SYNC_SECRET`・`GOOGLE_TOKEN_ENCRYPTION_KEY`）、`backend/google-oauth.env`・`compose.auth.json`（Googleログインの秘密）、`backend/push.env`（通知の秘密鍵）、`local-app.env`、`backend/gas-before-*.json`・`*/secret.js`（シート連携の合言葉）ほか。本番は自分のコピーを暗号化領域に持っているので、これらは不要。
   - **旧サービスの秘密（まだ有効な可能性あり）**: 旧クラウドSupabaseの `SUPABASE_SERVICE_ROLE_KEY`・DBパスワード（`data-dump-command.sh` など）、個人側R2の `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`（`.env.local` にも）。サービス側で失効させるまで有効。`VERCEL_OIDC_TOKEN` は短命で失効済みとみてよい。`cloudflared-token*.txt`・`tunnel-transfer-private.pem` は削除済みの旧Tunnelのもの。
   - **部員の個人データの平文（約17ファイル）**: `pc-auth-source-private-20261012/`（ログイン利用者・identityの書き出し、`cloud-auth-snapshot-*.csv`）、`backend/all-member-cloud-data-*.json`、`backend/rls-*-snapshot-*.json`、`backend/sheet-visibility-admin-*.stdout.txt` など。
   - **秘密を含まない大きなもの**: `retired-releases-20261022`（7.9GB）、`upstream`（Supabaseのソース、1.5GB）、`pc-jobs-*`（旧版のコピー）、各種ログ・旧スクリプト。
   - **⚠ 消してはいけないもの**: `pc-auth-source-private-20261012/linux-storage-20261013/windows-bootstrap-20261014/`。Windows起動タスク「TUAT Local Runtime」がここの `windows-boot.mjs`・`windows-boot.json` を実行し、暗号化領域の解錠鍵（`luks-key.machine.dpapi`）もここにある。消すとPCを再起動したときに本番が起動しない。**`.contingency` を丸ごと消さない。** 安定した場所（例: `C:\ProgramData\TUAT-TF\`）へ移すのは、管理者権限でのタスク再登録が要る別作業。
   - タスク「TUAT PC Jobs」は旧Jobsの設定（`.contingency/backend/pc-jobs-production.json`）を指したまま「準備完了」状態で、無効化されていない。
2. **同じ鍵のコピーが大量にある。** 本番反映のたびに複製され、`installation-*` が73世代、`recovery-backup.key` が73個、アプリのenvが172個。暗号化領域内なので直ちに漏れるわけではないが、どれが現行か分かりにくい。
3. ~~復号鍵のPCの外の控えが旧R2に依存~~ → 2026-11-08に直接の控えを作成済み。

## 5. 次にやること（候補）

- [x] バックアップ復号鍵そのものの控えを作る（2026-11-08、iPhone）。鍵を作り直してはいけない。控えを作り直すときも下のスクリプトを使う。
  本番PCのPowerShellで `powershell -NoProfile -ExecutionPolicy Bypass -File D:\TUAT_TF\ops\handoff\show-backup-key.ps1` を本人が実行する。鍵は画面にだけ表示され、保存後に控えを入力し直して一致を確認する。ファイルやチャットには残さない。
- [ ] 後任へバックアップの鍵を渡す方法を決める（iPhoneだけに置かない）。
- [x] `.env.local` と `.contingency` の中の秘密を仕分ける（2026-11-08、上の1）。
- [ ] 仕分けた不要物を削除する（起動に使うフォルダは残す）。
- [ ] 旧クラウドSupabaseと個人側R2を使い続けるか決め、使わないならサービス側で鍵を失効・削除する。
- [ ] 起動用のファイルを `.contingency` から安定した場所へ移す（管理者権限が必要）。
- [ ] 古い `installation-*` 世代を `pc-release.py prune` で片付けられる範囲を確認する。
- [ ] 各サービス管理アカウントの復旧手段を後任へ渡す方法を決める。
