# pc-backup — バックアップの状態をアプリへ知らせる

バックアップそのもの（採取・暗号化・Drive への保存・復元の確認）は [local-minimal](../local-minimal/BACKUP.md) が行う。このフォルダは、その結果を見て「いまのバックアップは新しいか」をアプリと Jobs へ知らせる。

- アプリの起動（`ops/pc-host/run.mjs`）が `run.mjs` の `startBackupSupervisor` を呼ぶ。
- 本番の設定（`profile: "pc-private"`、`localSnapshotReceiptFile` あり）では、自分ではDBを採取しない。`local-minimal` が書いた受領証（`local-snapshot.json`）を読み、状態ファイル `backup-lifecycle.json` を更新するだけ。
- 受領証は1日1回のバックアップに合わせて48時間まで有効とみなす。心拍は120秒。
- 状態ファイルの形は `status.mjs` と `status-vectors.json`（アプリ側 `src/lib/pc-backup-status.ts` と同じ試験データ）で決まる。

| ファイル | 中身 |
|---|---|
| `run.mjs` | 起動・心拍・停止 |
| `config.mjs` | 設定の検査（置き場所・所有者・Drive の設定） |
| `status.mjs` / `application-status.mjs` | 状態ファイルの形と、アプリが読むときの判定 |
| `archive.mjs` | 暗号化の形式（`TUATPC01`、AES-256-GCM） |
| `retention.mjs` | 残す世代の決め方（新しい順に手元24・Drive 96、30日分は1日1つ、最新は必ず残す）。`local-minimal/snapshot-retention.mjs` が使う |
| `adapters.mjs` / `files.mjs` | 旧方式（15分ごとにこのフォルダ自身がDBを採取して保存する）の部品。本番の設定では動かないが、`run.mjs` が読み込んでいるので残っている |

`node ops/pc-backup/run.mjs --check <設定ファイルの絶対パス>` は設定の検査だけを行う。
