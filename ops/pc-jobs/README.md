# pc-jobs — 定期処理

`tuat-local-jobs` サービスが `run.mjs` を動かす。自分では Next.js を起動せず、`ops/pc-host` が起動したアプリ（`http://127.0.0.1:<port>`）の API を決まった時刻に呼ぶ（設定の `runtime: "shared-pc"`）。

| 処理 | 日本時間 | API |
|---|---|---|
| 記録同期 | 毎日0時 | POST /api/sheets/sync |
| 大会同期 | 5分ごと | POST /api/competition-program/sync |
| 期限切れ整理 | 毎日12:17 | GET /api/cron/cleanup-stories |
| 通知の配信 | 1分ごと（`LOCAL_WEB_PUSH_ENABLED=true` のとき） | POST /api/push/deliver |

## 動き方

- 10秒ごとに設定の停止スイッチ（`enabled`）だけを見る。処理の直前に毎回、アプリの版（`/api/version` の SHA と releaseId）、アプリの心拍（120秒以内）、バックアップの状態を確かめ、合わなければその回は実行しない。
- 実行前に `journal.json` へ「実行中」を書く。結果が分からない・途中で失敗した回は履歴に残し、同じ回を自動で送り直さない。止まっていた間の分はさかのぼらず、各処理の最新の回だけ行う。
- 記録同期が失敗・結果不明のときは `sheetWritesBlocked` を残し、翌日以降はシートへの書き込みを止めて取り込みだけ続ける。API が「書き込みはしていない」と明示した失敗（読み取り失敗・見出しの不一致）は、翌日の書き込みを止めない。
- 通知の配信が失敗・結果不明のときは `pushFailures` に残し、次の回を1・2・4・8・15分と間を空ける。結果不明の配信を送り直すことはしない。
- `enabled` を `false` にすると次の処理へ進まず、実行中の要求を待って終わる。強制終了で残った `runner.lock` と結果不明の記録は、プロセス・データ・同期の履歴を確かめてから直す。再起動しただけでは消えない。

## 設定と検査

- 設定の形は `config.shared-pc.example.json`（値は例）。本番の設定は反映（`pc-release.py`）が作る。
- `node ops/pc-jobs/run.mjs --check <設定ファイル>` は設定の検査だけ。`--run` は `enabled: true` が必要。
- 版を切り替えるときは、同じ `stateDirectory` と `activateAt` を引き継ぐ。`journal.json` を空にしない。

## 通知（Web Push）

`notifications` への追加 → DB の `pc_ops.local_push_delivery` → Jobs → `/api/push/deliver` → ブラウザの通知サービス、の順に届く。配信は送る前に1件ずつ確保し、成功・購読の失効・失敗・結果不明を記録する。

- 配信 API は `LOCAL_WEB_PUSH_ENABLED=true` と `CRON_SECRET` の Bearer を要求する。DB の確保・完了の関数は service_role だけが呼べる。
- DB 側の有効・無効は管理者の接続で切り替える。止めるときは先に Jobs の新しい配信を止め、送信中の結果を確かめてから `false` にする。確保済み・結果不明の行を消したり成功に書き換えたりしない。

```sql
BEGIN;
SET LOCAL pc_ops.local_runtime = 'on';
SELECT pc_ops.set_local_push_enabled(true);  -- 止めるときは false
COMMIT;
```

- VAPID の公開鍵だけを新しい値へ変えない（既存の購読が使えなくなる）。公開URLが変わると、端末ごとに通知の再登録が要る。

## このフォルダのほかのファイル

| ファイル | 中身 |
|---|---|
| `scheduler.mjs` | 回の決め方と履歴 |
| `shared-pc.mjs` | アプリの版・心拍・バックアップの確認 |
| `gas-*.test.mjs` | `gas/` のスクリプトの試験（置き場所だけここ） |

`run.mjs` には、Jobs 専用の Next.js を別に起動していた頃の分岐（`runtime: "dedicated"`）が残っている。本番では使っていない。

試験: `npm run test:ops`。試験が通っても、再起動後の動きや実際の同期を確かめたことにはならない。
