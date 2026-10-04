# 本人用の独立検証環境

このPC上の独立worktreeで動く検証版。本番と別のDB・Auth・JWT鍵・origin・cookieを使い、操作は本番へ反映しない。DB内のデータは合成データだけ。Googleログイン・外部同期・Push配達・R2画像変更は停止する。PC、WSL Ubuntu、専用コンテナ、アプリ、gateway、スマホ用トンネルの稼働が必要。

| 対象 | 専用の接続先 |
| --- | --- |
| Docker project / DB | `tuat-quality-review` / `tuat-review-db` 内の `tuat_review` |
| DB volume / network | `tuat-quality-review_review-data` / internal network `tuat-quality-review_review` |
| gateway / Auth / REST / Next | loopback `18000` / `18001` / `18002` / `18003`。DBポートは公開しない |
| スマホorigin | `device.json` に指定した一時HTTPSホスト。ログイン・更新・画面移動は同じorigin内 |
| 認証cookie | `sb-pc-trial-auth` と本人ブラウザ枠 `tuat-review-device` |

## 実際の入口と依存順

コマンドは独立worktreeのルートからNode 22で実行する。現行PCのNodeは `C:/Users/rainb/AppData/Local/mise/installs/node/22.14.0/node.exe`。検証用の依存環境を使い、本番の環境変数・`.env*`・依存を持ち込まない。`run.mjs` は作業先にアプリの `.env` 系ファイルがあると拒否し、OS実行に必要な変数と専用 `app.env` だけを子プロセスへ渡す。

| 入口 | 前提・実施内容 |
| --- | --- |
| `node ops/review/prepare.mjs` | **初回準備のみ**。WSL/Dockerと本番 `supabase-db` の読取りが必要。schema-onlyとAuth migrationの版履歴だけを読み、独立した鍵・compose・init SQL・app.envを生成する。実ユーザー/投稿/本番資格情報はコピーせず、DB起動・適用も行わない |
| 専用 `docker compose up -d` | 下記の生成済みcomposeを指定。Auth/RESTは専用DBのhealthy待ち。既存volumeではinit SQLは再実行されない |
| `ops/review/loopback-bridge.py` | コンテナ起動後、WSL UbuntuのPythonで実行。専用project/networkを確認し、Auth/RESTだけをloopbackへ中継する。現行構成でWindowsから18001/18002へ到達するために使用。既存bridgeと重複起動しない |
| `node ops/review/seed.mjs` | Auth/RESTへのloopback接続が必要。合成owner/部員・アプリデータを一度だけ投入し、ownerId・seed・device・アクセスコードを保存。`seed.json` があると拒否。部分失敗後も状態を調べず再投入しない |
| `node ops/review/run.mjs build` | seed完了、`device.json`、隔離依存が必要。専用envで `.next-pc-trial` をビルドし、成功後だけ `build-id.txt` を保存 |
| `node ops/review/run.mjs start` | 成功したbuildとmarker、seedが必要。Nextを18003で起動。子PIDを `app-next.pid` に記録 |
| `node ops/review/gateway.mjs` | config/device/seedとAuth/REST/Nextが必要。18000で本人アクセスと同一originの中継を提供。外部API・本番Authへの移動を遮断 |
| スマホ用トンネル | gateway稼働後、`cloudflared tunnel --url http://127.0.0.1:18000 --no-autoupdate`。HTTPSホストをdeviceへ登録し、gatewayを再起動してから利用 |

WSLパスを確認して、**生成済みの専用composeだけ**を起動する例:

```powershell
$reviewRoot = (Get-Location).Path
$reviewWslRoot = (wsl -d Ubuntu -u root -- wslpath -u $reviewRoot).Trim()
wsl -d Ubuntu -u root -- docker compose -p tuat-quality-review -f "$reviewWslRoot/.contingency/review/compose.json" up -d
wsl -d Ubuntu -u root -- python3 "$reviewWslRoot/ops/review/loopback-bridge.py"
```

bridgeは別の端末セッションで継続稼働させる。新しい未適用migrationは内容を確認し、`tuat-review-db` / `tuat_review` だけへ適用してから対応するアプリを試す。現在のschema導入・個別起動は確認済みだが、**新規環境の空volumeからprepare→init→seed→起動を一括再現する試験は未実施**。既存状態を初回構築の検証済み証拠にしない。

## スマホの本人アクセス

初回に専用ログインへ `.contingency/review/access.txt` の本人コードを貼り付ける。今回の配布ファイルはコード値のみ。本番パスワードは使わない。config・app.env・access・deviceは秘密のローカル状態として保持し、ログ・公開文書・Gitへ転載しない。

最初に接続した**一つのブラウザ枠**を7日間確保する。端末そのものの識別ではないため、別ブラウザは別枠として扱う。PWAとのcookie共有と接続枠は実機未確認。移すときは現在の検証版から「検証版からログアウト」を押す。同一originのPOST `/_pc/logout` が枠と検証cookieを解除する。

一時Cloudflareホストが変わった場合は、`device.json` の `publicOrigin` を新しいHTTPS originに変更し、`deviceHash` を `null`、`expiresAt` を `0` にして**gatewayを再起動**する。gatewayは状態を起動時に読み込む。旧ホストのcookieは新ホストへ移らない。Nextも起動時にpublic originを読むので、新しい値で起動し直す。アプリ変更時は専用buildを成功させてからstartする。

## 確認と停止

- `node ops/review/verify-isolation.mjs`: 専用3コンテナ・internal network・別volume・合成7人・外部JWT拒否・公開bundle内秘密なし・RLS・Push停止を確認。専用buildとAuth/REST稼働が必要。
- `node ops/review/verify-browser.mjs <Playwright index.mjsの絶対パス>`: Chrome/WebKitがインストール済みで、HTTPS登録・gateway/Next/Auth/RESTが稼働し、本人枠が空いていること。合成画面、同一originの更新、2番目のブラウザ拒否、外部連携拒否、ログアウトを試す。実機iOS/Android確認とは区別する。
- `node --test ops/review/gateway.test.mjs`: gatewayの分離・アクセス判定の回帰。実環境の一連試験とは別。

停止は検証用PIDだけ。`app.pid`・`gateway.pid`・`tunnel.pid` はWindows起動PID、`bridge.pid` もWindowsのWSL起動PID。PIDファイルの数値だけを信用せず、`Get-CimInstance Win32_Process` で実コマンド・このworktreeのパス・親子関係を照合する。Nextの子は `app-next.pid` と親関係も確認する。トンネルは対象がloopback18000であることを確認してから、その検証プロセスだけを止める。

WSL起動プロセスの停止でLinuxのPythonまで終了する保証はない。Ubuntuの `ps` で専用 `loopback-bridge.py` と同じworktreeパスを確認し、そのPython PIDだけを停止する。専用DB/Auth/RESTも止める場合は上記と同じproject・compose指定で `docker compose ... stop` を使い、合成データのvolumeを保持する。本番プロセス・本番コンテナ・WSL全体・共有node_modulesは変更しない。
