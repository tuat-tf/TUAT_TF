# PC集約の残作業 — 2026-10-09

担当: Codex。開始 2026-10-09 19:49 JST。依頼: 「残りの作業も終わらせて」。

## 受入条件と現在の範囲

- `https://tuat-tf.vercel.app` を維持し、既存認証・権限・通常データ・画像を保つ。PCへ処理を移す前に、入口の通信、同じアプリ成果物、PC停止時の予備接続、自動起動を確認する。
- 送信結果が不明な記録を再送しない。現在値とシート・バックアップを照合してから同期の保留を解除し、元の失敗履歴と別の未処理データを残す。
- 公開入口・Vercel保護・本番DB・デプロイの変更担当はCodex一本。作業ツリーは `feat/pc-unified-20261008`、最新 `origin/master` は開始時 `7786c349cfb735dc1463fc8303b69a21343b91d3`。元の作業ツリーの既存差分は退避し、変更を戻していない。

## 確認済み

- AC接続時の蓋閉じ設定を「何もしない」に変更。`powercfg /qh` でAC=0、DC=1を確認した。バッテリー設定・アイドル設定は保持。蓋閉じ実試験・OS再起動は未実施。
- Vercelの固定Production deploymentはREADY、SHAは上記master。固定URLの匿名アクセスはVercel保護へ転送されるため、予備通信には専用キーが必要。
- 記録同期の10/8失敗はGAS正常応答後、DBの更新確認が1行にならなかったもの。旧「POST必須」の失敗とは別件。当時のpayloadは残っておらず、具体的な競合原因は未確定。
- 対象の現在5日分は書込みセル・DB・終了後の暗号化バックアップが一致。距離の計算列はGoogle Sheetsの実数式 `G+I+K+M` を読み取り確認。別本人のpending4件、未処理削除等の状態も照合した。
- 稼働中の専用Jobsを `enabled=false` で処理完了後に停止。タスクReady、runner.lockなし、3112の待受なしを確認。DB・既存中継・クラウド認証は維持。
- 20:29 JSTにシートをGETで再取得し、DB・対応列の不変を再確認。復旧dryRunは今回1件のみを照合済みと注記し、元の失敗4件・最新partial・従来の復旧履歴を保持。同日再送0、次回は10/10 00:00 JST。
- スナップショット・ファイルhash・停止状態を再確認後、journalの保留フラグと今回の復旧履歴1件だけを適用。DB上の元のerror/理由/件数は変更せず、別のpending4件も保持した。
- 20:30 JSTに同じrelease・portの既存タスクを再開。タスクRunning・専用lock・固定SHAのNext応答・大会5分枠の実successを確認。シートの最新partialはそのままで、状態表示も確認事項として残す。明日0時の実送信結果はまだ未確認。
- backend心拍・暗号化backupはfresh、mirrorはプロセス正常終了。mirrorの行ごとの書戻しが完了した証拠とは扱わない。

## ローカルで検証した実装

- App: Next/Tunnelの予期しない終了を失敗として返し、停止後のready復活・lease再公開・古い稼働表示を防止。意図的disableは受けた保存を一回だけ完了し、lease撤回・330秒drain・自身のchild終了を維持。
- Jobs: 専用Global mutexを保持するwrapperだけに、二回のPID不在確認と同一ファイル確認による残存lock復旧を許可。生存・再利用・権限不明・壊れたlockを保持。異常終了は失敗とし、journalの結果不明を再送しない。
- 起動確認: 実際の固定release・Node24・電源・S4U・task action等を読み取り照合。準備と公開を区別する。
- Vercel canary: 専用パス・合成データだけの試験、既存rule/stageの拒否、自分のrule IDだけの削除、削除版のpromote、終了時撤去を実装。CLIの自動retryを止め、loopback子プロセスで5xx一回送信と不正本文0回送信を確認。指定CLIの実GETも成功、rule0件。実mutationは承認待ち。
- PC/Nextのrelease ID validationをVercelの32文字以内・`dpl_`不可へ統一。

Node24で `check:environment`、`tsc --noEmit`、対象eslint、PowerShell構文、`git diff --check` が成功。既存Vitestは126 files / 1127 tests、統合 `test:pc-app` は126 tests成功。今回の修正後のbuild・push・新コードのProductionは未実施。前回の独立build成功を、今回の同一成果物公開の証拠にはしない。

## 作業中・未完了

- Vercelのランダムな専用検証パスだけを用いた実通信検証。通常アプリの入口は切り替えない。
- Jobs異常終了・残存lockの安全な復旧、自動起動の確認コードと受入テスト。
- 同一成果物・予備接続・本番PCアプリ設定・S4Uタスク・旧タブ/新タブの保存・実機PWA・OS再起動・24時間実行の確認。

同一成果物の候補はLinux x64のVercel CLI buildを一回だけ行い、Vercel用 `.vercel/output` をLinux側からprebuilt公開し、PCへは `.next` / `public` の同一bytesと検証metadataを渡す方法。Windowsには同lockfileのWindows依存を別に用意し、Linuxのnative依存を流用しない。現在のUbuntuにはLinux Node24がなく、Windows mise shimはLinux builderの代用にならない。実cross-OS起動・SSR/RSC/Action/画像処理と、古いタブの移行は未確認。

Automation Bypassキー1件の作成は自動承認審査で拒否された。永続キーがプロジェクト全deploymentの保護を通過できる範囲について具体的な承認が必要との理由。ユーザーへ範囲を明示して承認を依頼中で、キーは作成していない。保護の解除や別URLによる回避は行わない。

Vercelの専用パスだけの一時ルール（追加・promote・削除・削除版promote）もAGENTSの具体設定承認ルールに従って依頼中。通常URLのcatch-all変更や課金変更を、この一時試験の承認に含めない。

Vercel CLIのProduction環境取得はSensitive値をplaceholderとして返す。これを実設定として流用しない。root、既存Jobs、過去のローカル試験envには互いに異なる画像フラグがあり、部分的な一致だけでは本番との同値を証明できない。既存管理APIは本人認証が必要。ブラウザ確認は実行基盤が2回とも初期化失敗して利用できず、設定照合は未完了。

現行公開ログインHTMLから大学ドメインを読み取り回収した（値は非表示、private保存）。Drive OAuthの3設定は既存の4候補ファイルにもなく、明示された資格情報ファイルのpathも未特定。元設定ファイルの場所をユーザーへ依頼中。Pushの元設定は既存privateファイルにあり、公開VAPIDはProductionとの一致を確認した。Push秘密値の現行Edge設定との同値、R2の読取/書込/停止/容量フラグは未証明のため、PC設定を準備完了と扱わない。

診断例外に実データの一部、既存公開スクリプトの本文検索に非秘密のOAuth client ID・通知先アドレスが表示された。例外の生出力と広い本文検索を止め、以後は件数・キー名・一致判定だけを報告。平文の実データ退避、秘密値の公開ファイル・Gitへの混入はない。

## 本番反映

公開経路の切替・DB変更・migration・課金プラン変更・pushは未実施。コードは独立したローカル作業ツリーで検証中。PC電源設定と、照合済みの同期保留解除・専用Jobsの停止/再開を実施した。

関連コード・文書を専用ブランチのローカルcommitへまとめ、master反映・pushを保留する。新コードの本番稼働は未確認。Productionは20:38 JSTの再読取りで `7786c349cfb735dc1463fc8303b69a21343b91d3` / READYのまま。固定deploymentの保護302も再確認した。

## 終了保存（2026-10-09 20:48 JST）

ローカルcommit: `ed4ea8f13f28581ed00ce86d17e7c0a3490b822a`、ブランチ `feat/pc-unified-20261008`。独立作業ツリーはclean。最新masterとの差は4 ahead / 0 behind。作業ブランチ・masterともpushしていない。

元の作業ツリーには記録と索引だけを追加し、他作業のコード差分を保持。Vercelキー・一時ルールの具体承認と、Drive OAuth元設定の保存先回答を待つ。本番公開・無料化は未完了。OS再起動・蓋閉じ・実機PWA・明日0時の同期結果は未確認。

## キー承認後の継続（2026-10-09 20:49 JST）

担当: Codex。所有者の「キーの件についても承認する」を、Automation Bypassキー1件の具体承認として受領。専用パスの一時ルール、公開catch-all、料金変更の承認とは混同しない。

受入条件: generateだけを一回送信し、既存entryを保ち、新規1件の作成者・目的・時刻を照合する。結果不明はGETで照合し、生成を再送しない。秘密は専用directoryと空ファイルのACLを先にowner/SYSTEMへ制限してから書く。確認済み固定backupのexact URLだけへheaderで送り、query/cookie/log/Gitへ出さない。アプリ認証・権限は維持する。

作成前の21時前再検査で、固定backupが対象projectのProduction / READY / SHA `7786c349cfb735dc1463fc8303b69a21343b91d3` であることを再確認。通常URL・routing・build・DBを切り替えず、キーの作成と固定backup GETの確認を行う。

21:04 JSTにgenerateを一回だけ送信し、既存entry不変・追加1件・作成者/目的/時刻を照合した。最初のキーとして既定システム環境キーになった。専用private directoryと空ファイルをowner/SYSTEMだけのACLへ制限・読み戻してから秘密を書き、保存後のhashも確認した。キー値・API原文は表示しない。

21:06 JSTの固定backup GET検証で `/api/version` 200・SHA一致、`/login` 200、匿名 `/home` は307でログインへ戻ることを確認。キーなしでは引き続きVercel保護へ302となる。応答ヘッダー・本文にキーが含まれず、`_vercel_jwt` 等の保護cookieも返らない。アプリ側のログイン要求と公開保護を維持した。

最初の実行はAPI送信前のACL検査で停止した。Nodeから呼ぶWindows PowerShellへ親のPowerShell 7モジュールパスが混入したためで、子プロセスだけ既定module pathへ戻して解消。attempt記録の不在により生成PATCH未送信を確認後に進め、生成の二重送信はない。

キー作成・固定予備URLの疎通は完了。CF relayへのbinding設定、専用試験rule、公開経路の切替・新アプリdeploy・課金変更は未実施。一時rule承認、Drive OAuth元設定と本番画像フラグの照合、同一成果物/停止復帰/実機確認が残る。この文書のみの追記は手元に保持し、pushしない。

## 専用経路試験の承認後（2026-10-09 22:14 JST）

担当: Codex。所有者の「試験を続行して」を、説明済みのランダムな専用検証パスに限定した一時ruleの追加・promote・削除・削除版promoteの承認として受領。通常アプリのcatch-all変更・課金変更はこの承認に含めない。

受入条件: 本番の通常パス・実ユーザー・DB・R2へ書き込まず、合成HTML/RSC/gzip/cookie/POSTをVercelから一時CF WorkerとPCへ通す。POSTは結果不明でも再送しない。自身のrule IDだけを削除し、終了時にlive rule 0件・stagingなし、一時Workerの404・自身のTunnel終了を確認する。結果と撤去状態をこの記録へ追記する。

初回は追加後・公開前のversion ID検査で停止した。公式例の `icfg_` を形式要件として扱ったのが原因で、実応答はUUIDだった。追加ルールの名前・パス・接続先・Hostとstaging状態をGETで照合し、自身のrule IDだけを一回DELETE、空版を一回promoteした。22:17 JSTにlive rule 0件・stagingなしを確認。独立GETでも通常 `/login` と `/api/version` は200、元試験パスは307で合成PC応答なし。Worker削除404・Tunnel終了も確認した。

IDを安全な文字・128文字以内のopaque stringとして検証し、UUIDでの正常応答・結果不明の照合・不正ID拒否を追加した。二回目は公開経路を通ってHTML 200、PC到達、private/no-store、共有cache MISS、cookie 2個、PC側assertion失敗なしを確認した。Vercelが内部制御用 `x-vercel-enable-rewrite-caching` を消費するため、ブラウザ応答に同headerを必須とした試験条件で停止。終了処理で自身のrule削除・空版promote・live 0件/stagingなし・Worker削除/Tunnel終了が自動確認された。

ブラウザ側の判定を、制御headerは欠落または0を許容し、private/no-store・HIT拒否・二回ともPCで取得されたHTML・個別cookieを検証する条件へ修正。header消費を含む実loopbackの一連操作と、cache opt-in/HIT拒否を確認した（17 tests成功）。変更前の統合テスト実行はnpm子プロセスがNode18を使ったため失敗し、PATHをNode24へ統一して129 tests成功。最終変更後の統合検証と、三回目の実通信試験を進める。

22:24 JSTに三回目が全6群成功した。二回の非キャッシュHTMLと個別cookie、canonical redirect、RSC初期bytesが完了前に届くこと、gzip headerと実bytesの一致、一回だけの合成POST保存、異なるOriginの403拒否、保存受理後の切断でも再送/backup保存なしを確認。PC側のassertion失敗は0、通常保存1件、結果不明保存1件だった。結果不明は503として返し、アプリが無条件に再送しない。

自身のruleだけ削除・空版promoteし、live rule 0件・stagingなし、一時Workerの404・自身のTunnel終了を確認した。22:24後の独立GETでもlive 0件/stagingなし、通常 `/login` 200、公開 `/api/version` 200・SHA `7786c349cfb735dc1463fc8303b69a21343b91d3` 一致、元試験パス307・合成PC応答なしを確認した。最終統合テスト131 tests、環境確認Node24/直接依存35一致、対象eslint・diff checkも成功。独立エージェントがID照合・cache受入条件をレビューした。

これでVercel→一時CF Worker→PCの合成輸送試験は完了。Google OAuth・実DB/R2・実際のNext Server Action・旧タブ/新タブ・PWA実機・物理PC停止/復帰・120秒超APIは未確認。同一成果物と本番設定の照合が揃う前にcatch-all公開や無料化完了とはしない。

追加で、PC接続情報がない場合に実fixed backupへGETだけを送る一時CF Worker試験をprivate領域へ準備した。実行は自動承認審査で拒否され、プロセスは開始していない。理由は、既存のキー作成承認と限定試験承認に、秘密をCloudflareの新しいbindingへ渡す具体承認が含まれるとは確認できないため。所有者へプロジェクト全体のDeployment Protectionを通過できるキーを一時Workerのsecret bindingへ渡す範囲・GET限定・終了時削除を明示して承認を依頼中。Vercelキーの新規追加はなく、Cloudflareへ実キーは設定していない。

22:32 JSTの最終アプリ回帰テストは126 files / 1128 tests成功。前のrelease ID検査変更に対して古いエラーメッセージを期待していたテスト1件を訂正し、32文字の受入れ・33文字と予約prefixの拒否を追加した。アプリ実装の追加変更はなく、型検査も成功。予備接続の提案scriptは既定ではオフラインの計画表示だけとし、直接起動時の `--execute` だけで実行する。importや汎用テストで秘密の読込み・移送を起こさない。独立レビューで固定backup・GET限定・ACL・secret binding・秘密非出力・一回削除/404確認を照合した。

## 今回の保存と引継ぎ（2026-10-09 22:34 JST）

ローカルcommit: `2f0d18f0df65ae02a056808e5e4391d25f6d835a`（`feat/pc-unified-20261008`）。最新origin/masterから5 ahead / 0 behind、commit時の専用作業ツリーはclean。作業ブランチ・masterともpushなし、master反映なし、本番アプリはSHA `7786c349cfb735dc1463fc8303b69a21343b91d3` のまま。自身の一時公開ruleは0件へ撤去済み。契約変更・catch-all切替・新アプリProductionは未実施。

このcommit番号の追記は文書のみとして手元に保持し、次のコード変更と一緒に保存する。予備CF試験の実キー移送承認は未回答で、既定オフラインの確認だけを実施した。Drive OAuth元設定の場所への回答、本番画像flag照合、同一成果物、実際のログイン/画像/Action/旧タブ/実機PWA、物理停止復帰が残る。10月10日0時の定時記録同期と24時間運用はまだ実行時刻に達しておらず、確認済みと扱わない。
