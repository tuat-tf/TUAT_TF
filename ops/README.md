# ops — 本番PCの運用コード

全体の構成と日常の手順は [README](../README.md)。食い違ったら README が正しい。

| フォルダ | 中身 |
|---|---|
| [pc-host](pc-host/README.md) | アプリの起動、反映（`pc-release.py`）、Cloudflare の入口、省電力の設定 |
| [local-minimal](local-minimal/BACKUP.md) | WSL 内の起動（`runtime.py`・`pc/bootstrap.py`）、毎日のバックアップ（`backup.py`・`periodic.py`）、Drive への保存（`offsite.mjs`）、古いバックアップの整理（`snapshot-*.mjs`） |
| [pc-backup](pc-backup/README.md) | バックアップの状態をアプリと Jobs へ知らせる部分 |
| [pc-jobs](pc-jobs/README.md) | 定期処理（記録・大会・通知など） |
| [handoff](handoff/README.md) | 別のPCへ移す手順、鍵の地図 |

5つとも現役。ここを変えたら、反映後に次のバックアップが成功したことまで確かめる（確かめ方は README）。

旧構成のコード（旧Windowsバックエンド、旧クラウドとの同期、移行のときの確認用スクリプト）は2026-11-16に削除した。必要なら Git の履歴から取り出せる（例: `git log --diff-filter=D --name-only -- ops/`）。

## 試験

`npm test` はアプリのテストだけ。運用コードを変えたら次も走らせる。Windows と Linux の両方が必要で、片方の成功をもう片方の代わりにしない。

| コマンド | 必要な環境 | 中身 |
|---|---|---|
| `npm run test:ops` | Node 22 以上（Windows可） | Jobs・GAS・暗号化の、Windows でも動く分 |
| `npm run test:ops:windows` | Windows と Node 24 | ロックと起動まわり |
| `npm run test:ops:integration` | Linux と Node 24 | バックアップ・起動・Jobs・入口 |
| `npm run test:ops:linux` | Linux の root と Node 24 | ロック・所有者・隔離（Python） |
| `npm run test:cloudflare` | Node 24 | Cloudflare の入口 |

- このPCの開発用 Node は 22.14 なので、Node 24 が要る試験はそのままでは走らない。
- Linux の試験は、本番と別の使い捨て環境で走らせる。本番の WSL のサービスや DB を試験のために変えない。
- 環境が足りずに走らなかった試験は「未確認」と報告する。
