# ops — 本番PCの運用コード

全体の構成と日常の手順は [README](../README.md)。食い違ったら README が正しい。

| フォルダ | 中身 |
|---|---|
| [pc-host](pc-host/README.md) | アプリの起動、反映（`pc-release.py`）、Cloudflare の入口 |
| `local-minimal` | WSL 内の起動（`runtime.py`）、毎日のバックアップ（`backup.py`・`periodic.py`）、Drive への保存（`offsite.mjs`） |
| [pc-backup](pc-backup/README.md) | バックアップの状態管理と、古いバックアップの整理 |
| [pc-jobs](pc-jobs/README.md) | 定期処理（記録・大会・通知など） |
| [handoff](handoff/README.md) | 別のPCへ移す手順、鍵の地図 |
| [laptop](laptop/README.md) | 旧Windowsバックエンドの残り。バックアップが使う数ファイルと省電力の設定だけ |
| `pc-image-cleanup`、`pc-host/db-review`、`pc-host/backup-review` | 移行のときに使った確認用。今は使っていない |

本番が実際に動かしているのは `local-minimal`・`pc-backup`・`pc-host`・`pc-jobs`。ここを変えたら、反映後に次のバックアップが成功したことまで確かめる（確かめ方は README）。

## バックアップの動き

1日1回、DB・ログイン情報・画像をまとめて暗号化し、Google Drive へ保存する。保存したものを読み戻し、別のDBへ復元できることまで毎回確かめる。古いバックアップの整理は、消す候補があるときだけ、残すものと消すものを全部確かめてから行う。取得に失敗したときは「0件」として進めず、止まる。

## 試験

`npm test` はアプリのテストだけ。運用コードを変えたら次も走らせる。Windows と Linux の両方が必要で、片方の成功をもう片方の代わりにしない。

| コマンド | 必要な環境 | 中身 |
|---|---|---|
| `npm run test:ops` | Node 22 以上（Windows可） | Windows でも動く分 |
| `npm run test:ops:windows` | Windows と Node 24 | ロックと起動まわり |
| `npm run test:ops:integration` | Linux と Node 24 | バックアップ・起動・Jobs・入口 |
| `npm run test:ops:linux` | Linux の root と Node 24 | ロック・所有者・隔離（Python） |
| `npm run test:cloudflare` | Node 24 | Cloudflare の入口 |

- このPCの開発用 Node は 22.14 なので、Node 24 が要る試験はそのままでは走らない。
- Linux の試験は、本番と別の使い捨て環境で走らせる。本番の WSL のサービスや DB を試験のために変えない。
- 環境が足りずに走らなかった試験は「未確認」と報告する。
- `test:ops:db:cloud-fence`・`test:ops:db:final-fence` は旧クラウドからの移行用で、移行が終わった今は走らせる場面がない。
