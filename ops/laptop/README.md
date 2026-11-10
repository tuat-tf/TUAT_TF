# ops/laptop — 旧Windowsバックエンドの残り

旧構成（Windows上の中継・業務ミラー・バックアップ）は停止済みで、再開しない。大半のファイルは2026-11-11に削除した。必要なら Git の履歴から取り出せる。

残っているのは次のものだけ。

| ファイル | 残している理由 |
|---|---|
| `backup-backend.mjs`、`backup-retention.mjs`、`server-profile.mjs`、`export-backend-recovery.py`、`backend-files.mjs` | 現在のバックアップ（`ops/pc-backup`、`ops/local-minimal`）と Jobs が読み込んでいる |
| `power-saving.ps1`、[POWER-SAVING.md](POWER-SAVING.md) | 本番PCの消費電力を下げる設定。現役 |
| `cloud-mirror*.mjs`、`prepare.mjs`、`preflight.ps1`、`server-profile.ps1`、`compose.local.yml`、`initialize-wsl.sh` | ほかのファイルから名前で参照されている可能性があり、確かめきれていないので残した。使っていないと分かれば消してよい |
