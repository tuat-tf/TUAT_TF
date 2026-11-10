# TUAT T&F

東京農工大学陸上競技部の部員向けアプリ。練習記録・予定・出欠・大会結果・ノートを共有する。

- 公開URL: https://app.tuat-tf.workers.dev
- 技術: Next.js 16 / React 19 / Tailwind CSS 4 / Supabase（PC内で自前運用）

この文書は人間（管理者・後任）向けの入口。AIへの作業規則は [AGENTS.md](AGENTS.md)。

---

## 1. 全体の構成

```
部員のスマホ
   │
Cloudflare（公開URL・入口）
   │  Tunnelでつなぐ
本番PC（このWindows PC）
   └─ WSL（Ubuntu）の暗号化された領域 /var/lib/tuat-local
        ├─ アプリ（Next.js）
        ├─ DB（PostgreSQL）・ログイン（Supabase Auth）・DB API
        ├─ 画像
        └─ 定期処理（Jobs）・毎日のバックアップ
                 │
           Google Drive（部活アカウント）に暗号化して保存
```

- データの正本は**この本番PCの中だけ**。ほかのPCの同名フォルダやDBは本番ではない。
- 本番用のDocker・DBは、通常のDockerとは別の専用のもの（`unix:///run/tuat-local/docker.sock`、DBコンテナは `tuat-local-db`）。
- WSL内の主なサービス（systemd）:

  | サービス | 役割 |
  |---|---|
  | `tuat-local-app` | アプリ本体 |
  | `tuat-local-jobs` | 定期処理（記録・大会・通知など） |
  | `tuat-local-backup.timer` | 毎日1回のバックアップ |
  | `tuat-local-tunnel` | Cloudflareとの接続 |
  | `tuat-local-docker` / `tuat-local-containerd` | 本番専用のDocker |

- Windows起動時は、タスクスケジューラの「TUAT Local Runtime」がWSLと上のサービスを起動する。
- 旧Vercel URLは案内用に残っているが、本番ではない。旧クラウドSupabase・旧R2・旧中継は停止済みで、再開しない。
- Googleスプレッドシート連携はGAS（`gas/`）経由。現役は `gas/sync-clasp/Code.js`。`gas/combined.gs`（旧合体版）は使われている可能性があるため消さない。

## 2. 日常の運用

コマンドはすべて**本番PCのPowerShell**で実行する（管理者権限は不要）。

### 本番で動いている版を確かめる

https://app.tuat-tf.workers.dev/api/version を開く。`version` がGitのcommit SHA。

### 本番を更新する（本番反映）

1. 変更を `master` に入れてGitHubへpushする。
2. そのcommitのSHA（40桁）を確かめる: `git rev-parse HEAD`
3. 反映する:

```powershell
wsl -d Ubuntu -u root -- python3 -I -B /mnt/d/TUAT_TF/ops/pc-host/pc-release.py release <40桁のSHA>
```

ビルド・切替・起動確認まで自動で行い、起動しなければ元の版に戻す。終わったら `/api/version` が新しいSHAになっていることを確かめる。

- 計画だけ見る: `... pc-release.py switch <SHA>`（何も変えない）
- 古い版を片付ける: `... pc-release.py prune --keep 2`（確認のみ）→ `--execute` を付けて実行
- `package-lock.json` が変わった版は、PCにnpmがないため `--node-modules <Linux用node_modulesのdir>` が必要。
- 反映が済んだ版のフォルダ内で `git` コマンドを打たない（中身の照合が崩れ、次回起動を拒否する）。

### バックアップが動いているか確かめる

```powershell
wsl -d Ubuntu -u root -- systemctl show tuat-local-backup.service -p Result -p ExecMainExitTimestamp
```

`Result=success` と最近の日時が出ればよい。毎日1回、DB・ログイン情報・画像を暗号化してGoogle Driveへ保存し、読み戻しと別DBへの復元まで確認している。

### DBの中身を見る（読み取りのみ）

```powershell
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
"BEGIN READ ONLY; SELECT count(*) FROM profiles; ROLLBACK;" | wsl -d Ubuntu -u root -- docker --host unix:///run/tuat-local/docker.sock exec -i tuat-local-db psql --host=/tmp --port=18304 -U supabase_admin -d postgres -X -q -P pager=off
```

- `BEGIN READ ONLY; ... ROLLBACK;` で囲むと、間違ってもデータは変わらない。
- Windows PowerShellでは、SQLに日本語を入れると文字化けする。列の別名などは英字にする。
- 予定を誰が作ったかは `practice_schedules.created_by`（`profiles.id`）で分かる。編集した人は記録されていない。

## 3. 止まったとき

1. `/api/version` が開くか確かめる。
2. 開かなければ、サービスの状態を見る:

```powershell
wsl -d Ubuntu -u root -- systemctl list-units --all --no-pager 'tuat-local*'
```

3. PCを再起動したあとなら、タスクスケジューラで「TUAT Local Runtime」が動いているか確かめる。

**過去に起きたこと**
- 再起動後、前回の `backup-owner.lock` が残っていて起動に失敗したことがある。前のプロセスがもういないことを確かめてから外す必要がある。
- アプリを止めると監視がWSLのサービスやmountまで落としたことがある。計画的に止めるときは注意する。
- 暗号化領域が開いているかは、作業用のシェルではなくsystemd側（`nsenter -t 1 -m`）で確かめる。

**やってはいけないこと**
- WSLの全停止（`wsl --shutdown`）、Nodeの全終了、Docker volumeの削除を、試しにやらない。
- `D:\TUAT_TF\node_modules` を消さない。
- 新しいDBや別のストレージを作って「直す」ことをしない。

PCが壊れて別のPCへ移すときの手順は [ops/handoff/README.md](ops/handoff/README.md)。

## 4. 鍵とアカウント

詳しい一覧は [ops/handoff/KEYS-MAP.md](ops/handoff/KEYS-MAP.md)（値は書いていない）。要点:

- **バックアップの鍵**がいちばん大事。これがあればDriveのバックアップから、データもほかの鍵もすべて戻せる。ないと何も戻せない。PCの中のほか、管理者個人のパスワードマネージャー（iPhoneの「パスワード」）に控えがある。部活側にはまだない。Driveのバックアップと同じ場所（Driveのファイル）には置かない。
- アプリが使うそのほかの鍵（ログイン、DB、Cloudflare接続、Drive送信など）はPCの中にあり、バックアップにも含まれている。人が控える必要はない。
- サービスの管理は部活アカウントで行う: 部活Google（Drive・Google Cloud・GAS）、GitHub `tuat-tf`、Cloudflare。後任へはこれらのログイン手段とバックアップの鍵を渡す。
- 秘密の値はGit・チャット・ログに出さない。

**`D:\TUAT_TF\.contingency\` を消さない。** 移行作業中の秘密・個人データの平文コピーは2026-11-09に削除し、残っているのはWindowsの起動に使うフォルダ（`pc-auth-source-private-20261012\linux-storage-20261013\`）だけ。起動タスクがここを使っており、消すと再起動後に本番が起動しない。詳しくは鍵の地図の4章。

## 5. 開発

1. Node.js 24 を使う。
2. `npm ci`
3. `.env.example` を見て `.env.local` を用意する（本番の値を入れない）。
4. `npm run dev` → http://localhost:3000

| コマンド | 用途 |
|---|---|
| `npm run check:environment` | Node・依存の版がロックファイルと合っているか |
| `npx tsc --noEmit` | 型検査 |
| `npx eslint <変更ファイル>` | lint |
| `npx vitest run` | テスト |
| `npm run test:ops` | 運用スクリプトのテスト（Windowsで動く分） |
| `npm run build` | ビルド |

- DBの変更は `supabase/migrations/` に新しい時刻のファイルとして追加する。本番への適用前に、対象表の退避とdryRunで差分を確かめる。
- 権限は複数ロール方式（`roles`・`profile_roles`）。画面は `permissionsOf`、DBはRLSで守る。詳しくは [docs/PERMISSIONS.md](docs/PERMISSIONS.md)。
- 画面の作りと文言は [docs/UI-UNIFICATION.md](docs/UI-UNIFICATION.md)・[docs/WORDING-GUIDELINES.md](docs/WORDING-GUIDELINES.md)。
- 練習記録とスプレッドシートの同期の設計は [docs/SHEETS-SYNC-PLAN.md](docs/SHEETS-SYNC-PLAN.md)。

## 6. 資料の場所

| 場所 | 中身 |
|---|---|
| この README | 構成・運用・止まったとき・鍵 |
| [AGENTS.md](AGENTS.md) | AIへの作業規則 |
| `docs/` | 画面・文言・権限・同期の仕様 |
| [ops/handoff/](ops/handoff/README.md) | 別PCへの復旧手順、鍵の地図 |
| `ops/` の各README | 運用スクリプトの説明 |

2026-11-08までの作業記録・計画書（約180本）は削除した。必要なら Git の履歴から取り出せる（例: `git log --all -- docs/` で探し、`git show <commit>:<path>` で読む）。

## 7. 未確認のこと

- PCの再起動からの自動復旧は、最後の修正後にまだ試していない。
- 別のPCへの全体の復旧は、まだ試していない（バックアップの読み戻しと別DBへの復元は毎日確認している）。
- `TUAT_TF_NEXT_PAUSED`（D:ドライブ）は休止中の新アプリ。指示があるまで再開しない。
