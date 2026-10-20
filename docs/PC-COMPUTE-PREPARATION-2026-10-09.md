# PC集約の実経路検証と運用準備

担当: Codex。開始・検証: 2026-10-09 JST。

## 依頼と範囲

所有者の「やってみる？それから他にも準備することはある？できればPCで統一したほうが管理しやすいよね？」を受け、[10月8日の準備実装](PC-COMPUTE-UNIFICATION-2026-10-08.md)に続いて実経路の検証と管理手順を具体化した。公開URLは `https://tuat-tf.vercel.app` を維持する方針。今回の試験は別origin・session・DBに限定し、本番の切替、料金・Vercel設定変更、DB migration、master反映・pushは行っていない。

## 受入条件

- 画面・API・サーバー操作をPCへまとめ、既存DB・定期処理と合わせて結果と復旧状態を確認できる。認証、非公開画像、PC外バックアップ、クラウド予備は停止時にも必要な役割を保つ。
- 実ログイン・保存の隔離試験には別origin・session・DBを使う。合成HTTP試験と実Auth/DBの試験の根拠を区別する。
- Host、redirect、Cookie、RSC、圧縮を保持する。PCへの送信前にだけ予備を選び、送信後の結果不明を別サーバーへ再送しない。
- 更新、状態確認、バックアップ、差戻しを対象と手順へ落とし込む。PCの再起動・電源断・実機を別の成功から確認済みとしない。
- 具体的なVercel設定案と差戻しを用意し、AGENTSが求めるオーナー承認を適用する。無料化は契約条件と切替後の実使用量で判断する。

## 既存作業の保全

rootの既存diffと未追跡61件をignored領域へ退避した。rootでのff-only pullは既存docs/README.mdを保全して中止。独立worktree `.contingency/pc-unified-worktree` は最新origin/master `7786c349cfb735dc1463fc8303b69a21343b91d3` 上の自分のローカル2commit（着手時HEAD `152bb0d`）。最新masterとの比較は2 ahead / 0 behind。rootの未コミットコードは取り込んでいない。既存node_modules・WSL・本番サービスを停止・削除していない。

## 実装と実操作の結果

### CloudflareからPCのNextへ

実Cloudflareの専用一時Worker、専用Quick Tunnel、実app bridgeを経由する試験を実施。合成署名leaseはメモリ内だけで、既存R2や公開relayの設定を変更していない。

実経路で `encodeBody: manual` によるgzip破損を再現した。fetchが管理する圧縮へ修正し、生gzip bytesと一度だけの展開を確認した。HTMLのcanonical Host、複数Set-Cookie、private cache、canonical redirect、64 KiB RSC初期chunkの先着、異Originの拒否、結果不明のPOSTが1回だけ届くことを確認した。小さなRSC chunkの結合を、更新を失う失敗とは判定していない。

一時workers.devの作成直後はWorkerへ届く前の404/530が発生した。試験専用の公開準備待ちを設け、到達可能になってから実操作を確認した。本番relayの再送動作は追加していない。

### 独立Auth・DBと実ブラウザ

既存の独立レビュー環境 `.worktrees/app-quality-20261004` のGoTrue/RESTを使い、本番環境を継承しない別のproduction-mode Nextを18103でbuild・起動した。専用review adapterが同originのAuth/RESTを独立gatewayへ固定して転送する。

独立DBは別WSL compose project・volume・ネットワーク・鍵を使用。Authとprofile各7件が合成 `@example.invalid` で、一般データ60表のRLSと外部通知停止を読み取り確認した。本番Auth/DB/sessionを共有しない。外部OAuth・画像書込み・シート送信はこの試験では無効化した。

Chrome headlessで次の一連の操作が成功した。

1. 合成ユーザーで実GoTrueへログインし、専用cookieでCloudflare/Tunnel/bridge経由のNext SSRを開く。
2. ノート画面からフォルダを一度だけ作成する。実REST/RLSで本人の1行だけが保存されたことを確認する。
3. 再読込後も表示を保持する。検索による実Next Server ActionがHTTP 200となり、ブラウザのcanonical originを保持する。
4. 試験で作成した1行だけを削除し、不在を確認する。今回のsessionだけをsignOutし、既存合成ユーザー・データ・本人用ブラウザ枠を保持する。

一時Workerの削除後404、専用Tunnelの終了、専用Next 18103の停止を確認した。既存レビューNext 18003、本番gateway/DB/Jobsは継続している。停止した試験Nextのwrapperが終了1になったのは制御された終了であり、buildやブラウザ試験の失敗とは扱わない。

### 管理の集約

`ops/pc-app/status.mjs` を追加。backend・暗号化backup・mirror・PC Jobsのjournal・任意の新app状態を1回の読み取りで表示する。raw環境、エラー本文、個人ID、秘密値を出さない。PID/heartbeatだけで業務成功にせず、partial・uncertain・保留・期限超過を表示する。設定変更、journal解除、保存の再送はしない。

```powershell
node ops/pc-app/status.mjs --backend D:\TUAT_TF\.contingency\backend
# 新appを準備した後は --app <専用configの絶対path> を追加
```

appの更新・drain・lock復旧・build照合は既存runnerへ集約する。新appの本番config、lease、Windows taskはまだ作成・登録していない。

## Vercel入口と予備の準備

実projectを読み取り確認した。project-level routingは0件、live/staging versionは未作成。`stage-routing.mjs` は現URLのHostだけに一致するruleのpayload、事前GET、反映後の照合と差戻しをオフラインで用意する。既存stageを一括公開しない。現状は復元versionが無いため、今回のruleだけを削除して得る新versionを確認・promoteする差戻し案も用意した。書込み機能は無い。

初回は120秒の外部rewrite制限に収まらない可能性がある `/api/sheets/sync` を中継対象から除外する。専用PC Jobsは既にPCで実行されているが、この手動APIまで完全統一したとは報告しない。

現行READY Productionの固定deployment URLは匿名 `/api/version` と `/login` がVercelログインへ302になり、そのままでは予備に使えない。既存Automation Bypassキーは0件だった。

`worker.mjs` に任意の `BACKUP_PROTECTION_BYPASS` secret bindingを追加した。受信側から同名のVercel bypass headerを除去し、確認済み固定backupへだけ秘密ヘッダーを付ける。PC・ブラウザへ返さず、query/cookieを作らず、外部redirectを追わない。アプリ自身の認証・RLSは維持する。

`protection-bypass-plan.mjs` は正式 `PATCH /v1/projects/{id}/protection-bypass` の `generate: {note}` と、今回追加した1キーだけの `revoke: {secret, regenerate:false}` を準備する。HTTP送信機能は無い。作成前後で既存mapの不変・増分1件・作成者・目的・時刻を照合する。応答mapのkeyは秘密値なのでログへ出さない。

AGENTSの「Vercel設定…は具体的な変更についてオーナー承認を得る」に従い、検証用キー1件の作成承認を依頼中。実作成・secret設定・保護解除は未実施。このAPIに期限指定は無く、最初のキーはVercelのシステム環境変数の既定キーにもなる。キー自体の権限はproject全deploymentに及ぶが、relayからの使用は固定backup通信に限定する。既存buildを自動再buildする変更ではない。

参照: [Vercel正式API](https://vercel.com/docs/rest-api/projects/update-protection-bypass-for-automation)、[Automation Bypass](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation)、[Project routing](https://vercel.com/docs/routing/project-routing-rules)。

## 読み取りで判明した運用準備

2026-10-09 01:29 JST時点。数値・状態は現在値として再利用せず、次の操作前に読み直す。

- backendはready、暗号化backupは01:27完了。mirrorは01:28にプロセス正常終了。ただし現行statusは書戻しの行ごとの成功を証明せず、`writeback.failed` があっても終了0になり得る。行の復旧完了とは報告しない。
- PC Jobsは稼働中。大会・期限整理は成功しているが、10月8日0時の新しいsheetWritesUncertain失敗後にシート送信が保留中。10月9日0時はpartial・sheetWritesSkipped。failure履歴4件、既存recovery履歴3件は同一ではない。結果不明のデータと履歴の照合を先行し、解除・再送していない。
- AC自動スリープは無効だが、蓋を閉じた時はAC/DCともsleep。過去の「何もしない」の記録と異なる。電源設定は変更していない。
- OS最終起動は9月20日で、現行S4U構成が作られた後の無ログイン再起動復旧は未確認。試験のためにOS・WSL・全Nodeを停止していない。
- D:の空きは約614.4 GiB。新app用の3113/3114は未起動で、既存8000/3109/3112を保持した。

## 検証と残る条件

- Node 24.19.0でcheck:environment、tsc、対象eslintが成功。最初のnpm子プロセスのNode 18混入はPATHを専用Nodeへ修正して再確認した。
- Vitest: 126 files / 1127 tests成功。PC app・relay・状態表示・設定準備のNode受入テストは85 tests成功。追加オフラインplan後の対象eslint・diff checkも成功。
- Nextの独立環境production buildが成功。workerd/一時R2は6 groups / 9 requests成功。
- 実Cloudflareの合成transport試験は5 groups成功。後から追加したimmutable JS単独試験を含む6 groups全体の成功とは報告しない。独立Nextの実ブラウザ試験では実静的assetを読み込んで保存・再読込・Actionが成功した。
- 未確認: 実Vercel入口のrule/cache/120秒挙動と予備への到達、PC/予備の同build・同Action鍵・古いtab互換、PC電源断/OS再起動・停止中のブラウザ保存から復帰・行の書戻し、Google OAuth、実画像操作、iOS/Android PWA、24時間運用と無料枠の実CPU/転送量。

管理はPCへ寄せられる。クラウドAuth・非公開R2・PC外バックアップ・PC停止時の予備は、PCが止まった際の役割を保つ。Cloudflare Pagesへの静的化だけで現行Next全機能と現URLを維持する構成ではなく、PC処理とCDN入口を分ける準備である。Vercel有料契約は継続しており、無料化完了とは報告しない。

## 終了記録

コード・記録をローカル専用worktreeにまとめた。最終受入検証は上記の範囲。今回のローカルcommitはroot側の終了記録へ追記する。master、push、本番公開、料金・Vercel設定、本番DBに今回の変更は反映していない。

終了: ローカルcommit c03199f88bb4405d5a8bfddc0d143d44ad10eb38（feat/pc-unified-20261008）。専用worktreeはclean。rootへは今回の文書と索引入口だけを反映し、既存の未コミット作業を保持した。master反映・push・本番切替・Vercel設定・料金変更なし。
