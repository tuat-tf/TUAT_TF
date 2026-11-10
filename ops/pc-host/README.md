# pc-host — 本番アプリの起動と反映

全体の構成と日常の手順は [README](../../README.md)。ここは仕組みを直す人向けの補足。

## 動いているもの

```
Cloudflare → Tunnel → gateway（127.0.0.1のみ） → Next.js → PC内のDB・ログイン・画像
```

本番は WSL の `/var/lib/tuat-local/releases/<SHAの先頭7桁>/` にある版から動く。systemd が起動するのは次の3つ。

| サービス | 実行するもの |
|---|---|
| `tuat-local-app` | `ops/local-minimal/runtime.py --app` → `ops/pc-host/run.mjs`（gateway と Next.js） |
| `tuat-local-jobs` | `ops/local-minimal/runtime.py --jobs` → `ops/pc-jobs/run.mjs` |
| `tuat-local-backup` | `ops/local-minimal/backup.py`（タイマーで1日1回） |

- gateway も Next.js も 127.0.0.1 でだけ待ち受ける。外から届くのは Tunnel 経由の gateway だけ。
- Next.js は root ではなく専用の UID（65530）で動く。`linux-application-sandbox.sh` が `/mnt`（Windows側のファイル）を見えなくしてから権限を落とすので、アプリからバックアップや鍵は読めない。
- gateway は入口の制限（大きさ・時間・Origin）をするだけ。本人確認と権限はアプリと DB（RLS）が行う。

## 反映（pc-release.py）

使い方は README の「本番を更新する」。中でやっていること:

1. **build** — `D:\TUAT_TF` から指定の commit を clone し、依存を入れて、ネットワークを切った状態で `next build` する。
2. **prepare** — いま動いている設定一式（`private/installation-<旧>`）を写し、版に関わる値だけ差し替えて `installation-<新>` を作る。鍵はそのまま引き継ぎ、表示しない。
3. **switch** — バックアップのタイマーと Jobs を止め、アプリを止めて、設定を差し替えて起動する。`/api/version` が新しい SHA にならなければ元の版へ戻す。

知っておくこと:

- 本番PCには npm を入れていない（本番で外部からコードを取ってこないため）。依存は前の版の `node_modules` を写して使う。`package-lock.json` が変わった版だけ、ロックファイルどおりの Linux 用 `node_modules` を別に用意して `--node-modules <dir>` で渡す。中身はロックファイルと照合される。
- 反映した版のフォルダは、全ファイルのハッシュ（`.git/index` を含む）を記録して、起動のたびに照合している。そのフォルダで `git` を打つと `.git/index` が書き換わり、次の起動を拒否する。
- バックアップが使うコード（`ops/local-minimal` と `ops/pc-backup` の一部）もハッシュで固定している。反映のたびに作り直すので、普段は意識しなくてよい。
- `pc-release.py` は反映先の版ではなく、実行したファイルそのものが動く。直したら master に入れてから使う。
- 古い版は `prune --keep 2` で片付ける。

## このフォルダのほかのファイル

| ファイル | 中身 |
|---|---|
| `run.mjs` / `build.mjs` / `release.mjs` / `runtime-manifest.mjs` | 起動・ビルドと、ビルド結果の照合 |
| `gateway.mjs` | 入口の制限 |
| `linux-launch.py` / `linux-application-sandbox.sh` | 権限を落として起動する部分 |
| `runner-lock.mjs` / `backup-owner.mjs` | 二重起動の防止 |
| `cloudflare/` | 公開URLの Worker と Tunnel の設定 |
| `account-preflight.ps1` / `stage-task.ps1` / `task.ps1` | Windows で直接動かしていた頃の起動用。今は使っていない |
| `synthetic-review.mjs`、`backup-review/`、`db-review/` | 移行のときに使った確認用。今は使っていない |

試験の走らせ方は [ops/README.md](../README.md)。試験が通っても、本番の再起動・復元・実機での操作を確かめたことにはならない。
