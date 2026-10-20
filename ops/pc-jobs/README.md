# PC定期処理

## PC内アプリと共有する現在の構成

現在の主系・稼働記録・残る未確認は[PC本番運用](../laptop/PC-PRODUCTION-HANDOFF.md)の最新注記を優先する。`runtime: "shared-pc"` は、`ops/pc-host` が起動した一つのNextを再利用し、Jobs自身はNextを起動/停止しない。PC内構成ではAuthと画像もPC内で扱う。`config.shared-pc.example.json` はdisabledの例で、既存設定の置換には使わない。runtimeを省略する専用Next方式とcloud Auth/R2を使う旧共有方式は互換コードとして残るが、現在の稼働設定とは区別する。

共有方式の `appOrigin` は明示した `http://127.0.0.1:<port>` のrootだけ。公開URL・localhost・path・credentials・redirectは拒否する。固定releaseの `PC_APP_RUNTIME` / `NEXT_PUBLIC_PC_APP_RUNTIME`、固定HTTPS `APP_PUBLIC_ORIGIN`、same-originの公開Supabase URL、同期設定を検査する。PC内構成では `PC_LOCAL_RUNTIME` / `NEXT_PUBLIC_PC_LOCAL_RUNTIME` を一致させ、別々のloopback Auth/REST、local画像、R2画像読書き無効を確認し、cloud Auth/画像設定の混在を拒否する。

`/api/version` のcommit SHAとreleaseId、hostのrunning/心拍とbackup identityを照合する。`hostStateDirectory`・`backupStatusPath`・既存archive UUID/実DB system IDを固定し、そのgenerationの35分以内backup・120秒未満心拍/target・maintenance解除を確認する。local画像もcombined snapshotのreceiptと照合する。旧backend statusだけでhostをreadyにしない。RESTのOpenAPI確認はloopbackだけへ行い、PC内構成では保護されたservice-role、旧共有方式ではanon keyを使う。部員の行は読まない。

10秒の待機ループはlocal設定の停止スイッチだけを確認し、処理対象がない間はOpenAPI/versionを取得しない。各処理の実行直前には上記の確認を毎回行う。確認中の無効化も再確認し、journal保存・dispatchを行わない。

`run.mjs --check <private-config>` はbuildと設定の検査のみ。共有方式のbuildは `ops/pc-host` が担当し、Jobsの `build-production.mjs` は拒否する。`preflight.mjs` は共有Nextを再利用して未認証拒否と既存APIのdryRunを実施し、終わっても共有Nextを止めない。APIのdryRunは実同期元への読取を伴うので、今回の合成試験と同一視しない。

今後配置やreleaseを切り替えるときも、既存のJobsをdisabledにして実行終了・lock解放を確認してから、同じstateDirectoryとactivateAtを引き継ぐ。journalを空にしない。特に `uncertain` / `sheetWritesBlocked` / 元の失敗履歴は保持し、新旧を同時実行しない。検証準備で現在の設定を変更しない。

合成試験: `node --test ops/pc-jobs/scheduler.test.mjs ops/pc-jobs/shared-pc.test.mjs`。固定release不一致、公開/曖昧URL、古い/未来の心拍、maintenance、共有方式の子プロセス不使用、遅いprobe中の無効化、既存journalの再送停止を確認する。OS再起動・定時実行・R2/GAS本番・実端末の確認は別途必要。

同じPC内NextのAPIを以下の頻度で呼ぶ。Pushは `LOCAL_WEB_PUSH_ENABLED=true` と必要な設定がある場合だけ対象にする。

| 処理 | 日本時間 | API |
| --- | --- | --- |
| 記録同期 | 毎日0時 | POST /api/sheets/sync |
| 大会同期 | 5分ごと | POST /api/competition-program/sync |
| 期限切れ整理 | 毎日12:17 | GET /api/cron/cleanup-stories |
| local Push配信 | 1分ごと（有効時） | POST /api/push/deliver |

Vercel cronと旧DB cronの停止を維持する。[9/27記録](../../docs/OPERATIONS-2026-09-27.md)は最初の3処理のPC移行時の記録であり、現在のreleaseや配置を示すものではない。古い隔離候補や合成buildを本番へ使わない。

## 準備と検証

Node24を使う。現在の共有方式のbuildはhost側で行う。hostの固定release/envと既存Jobsの`stateDirectory`・`activateAt`を引き継いだshared-pc設定を`run.mjs --check <private-config>`で検査する。検証のために新しいjournalや未来のactivationへ置換しない。

`prepare-production.mjs`は退役した入口で、旧環境を読む前に非0終了する。旧生成処理は`legacy/prepare-dedicated.mjs`へ保管し、明示的な`--legacy-dedicated`なしでは動作しない。`prepare.mjs` / `build-production.mjs`も旧専用Next用であり、現在のPC内構成を再配置する手順ではない。既存の旧release/env/stateは保全する。

旧方式のbuild-production.mjs <private-config> は専用リリースをbuildする。preflight.mjs <private-config> は専用方式では一時起動し、共有方式では既存Nextに接続して、未認証拒否と記録・大会のdryRunを行う。--without-records は部分確認専用で、全処理の準備完了を意味しない。結果は非公開stateに保存し標準出力は件数のみ。

run.mjs --check <private-config> は設定・buildを検査するだけ。--run はenabled=trueが必要。構成ごとの検査は `shared-pc.mjs` 等で行い、PC内構成と旧cloud Auth構成を混在させない。Nextはloopback限定で、Jobsのために公開経路を追加しない。

## 実行と停止

実行前にjournalへrunningを保存する。結果不明・部分失敗は履歴を保持し、同じ枠を自動再送しない。PCのmaintenance・心拍・35分以内のバックアップを確認する。停止期間の全回分は再生せず、各処理の最新枠だけを行う。記録同期とPushの後続枠は下記の制約で扱う。

config.enabled=falseにすると次の処理へ進まず、実行中の要求を待って終了する。強制終了時のrunner.lockとuncertainは、プロセス・データ・同期履歴を確認してから復旧する。再起動しただけでは失敗状態を消さない。

2026-10-04以降、記録同期の失敗・結果不明は `sheetWritesBlocked` と元の失敗履歴を保持する。同じ枠の再送はせず、翌日以降は `skipSheetWrites` で取り込みだけ継続する。送信・記録の空欄化は保留し、pendingフラグと削除待ちを残す。この結果は `partial` であり、完全成功ではない。送信再開はシートの実値・DB・履歴を照合した復旧後に行う。大会・期限切れ整理の結果不明時は停止を維持する。旧返信処理は廃止済みであり、過去の復旧記録から再開しない。

Pushの失敗・結果不明は `pushFailures` に保持し、後続枠は1/2/4/8/15分のbackoffを適用して未処理のpendingだけを選ぶ。配信API側がfailed/uncertain/claimedを保護するため、結果不明の配信を自動再送する意味ではない。

外部メール監視は取りやめ済み。GAS監視・Worker health・署名鍵を稼働条件に含めず、外部healthは書かない。状態はPCのjournal/status.jsonに保存する。旧監視用の準備スクリプトは実行しない。

2026-10-05の修正以降、APIが `sheetWritesUncertain=false` を明示した読み取り失敗/見出し不整合はfailedとして保持し、翌日の送信を保留しない。応答不明・旧API・書き込み後の不一致は従来どおり保留する。既に保留中の書き込みを読み取り成功だけで解除しない。稼働固定リリース、実データ照合、復旧証跡は [10/5の同期復旧](../../docs/SHEET-SYNC-RECOVERY-2026-10-05.md) を参照。

## 旧Vercel cronからの移行記録

以下は2026-09-27の切替手順として残す。現在のPC内アプリから旧Vercel cronや旧Windows Jobsを復活させる指示ではない。今後の移設は最新のPC本番運用と同じjournal/activationの引継ぎを基準にする。

1. 全dryRun、同期元、バックアップ、現行Productionを確認する。
2. 最新アプリのVercel cronを外し、READYと旧処理終了を確認する。
3. 未来のactivateAt以降だけPCが担当するよう設定し、専用Windowsタスクを設置する。既存DB/backendタスクは変更しない。
4. 3処理の初回結果、二重処理なし、翌日の定時実行を確認する。手動同期との分散排他はないので切替中は実行しない。

当時の切り戻し案は、PCを無効化し実行終了後に専用タスクを止め、同じ最新アプリへ元のcronを戻すものだった。現在は旧writer/cron停止を維持し、これを通常の復旧手順として実行しない。新旧の同時実行、料金プラン変更、メール監視再開は行わない。

予定の自動同期は2026-09-27オーナー指示で取りやめ。既存予定・手動操作は保持する。旧方式のinstall-task.ps1はWindows管理者権限で専用S4Uタスクを無効状態で登録する。現在の配置を確認せず実行しない。
