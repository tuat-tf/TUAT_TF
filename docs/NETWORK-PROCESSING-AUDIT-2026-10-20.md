# 通信量と不要処理の調査（2026-10-20）

## 開始・対象

依頼は通信量削減と無駄な処理の候補一覧。実装・公開・設定変更は行わない。最新origin/masterをfetchし、`39c525d6cf9f5881ac648c8592bb4d42cec65294`を調査基準とする。元の作業コピーは旧ブランチに未コミット変更が多数あるため、変更を保全し、同SHAの既存master作業コピーを読み取りに使用する。

対象は画面の取得・再取得、サーバーの取得範囲、画像配信、同期とバックアップ。既存対策と反映済み修正を区別し、候補ごとに根拠・発生条件・削減案・維持すべき動作を確認する。実通信量・利用頻度・実機電力を測定したものではなく、コードからの確認と推計を分ける。認証・権限・データ・同期履歴・復旧保証を保持することを将来の実装条件とする。

## 確認範囲と結果

公開入口の `/api/version` を読み取り、version=`39c525d6cf9f5881ac648c8592bb4d42cec65294`、releaseId=`pc-local-39c525d` を確認した。下記の行番号は同SHAのコードを指す。読み取り先は `D:/TUAT_TF/.worktrees/pc-folders-20261008`。同作業コピーの既存文書差分も変更していない。

スマホと公開入口の通信、PC内DB/RESTの通信、PCのCPU・ファイル読込みを区別した。コード上の発生条件を確認した調査であり、各操作のブラウザ再現・HAR採取・本番データ件数計測は実施していない。頻度と容量は以下に示す条件による推計である。

## 先に取り組みやすい候補

### 1. いいね操作でコメント全件を再取得する

- 根拠: `src/components/cards/PostActions.tsx:72` の件数通知callbackが `initialLiked/initialLikes` に依存し、`:293` のタイムラインcache更新で変化する。`CommentSection.tsx:41,91` はこのcallback変更を取得effectの依存に含める。
- コメントを一度開いた投稿が対象。`PostActions.tsx:396` は閉じた後もmountを維持するため、非表示でも再取得し得る。コメント全件1回と、コメントありならいいね状態RPC1回が追加される。
- 件数通知callbackとコメント取得の依存を切り離す。閉じても未送信文を保持する仕様、編集/削除後の件数、結果不明時の確認を維持する。実操作での再現は未実施。

### 2. 予定APIで出欠データを二重に送る

- 根拠: `src/lib/schedule-page-data.ts:56,70,81` は出欠を `attendeesBySchedule` にまとめつつ `schedules[].attendances` も返す。`src/app/api/schedule-page/route.ts:13` がそのままJSON化する。利用側の `ScheduleView.tsx:119` は前者を使う。
- JSON応答から余分な出欠コピー1組を除ける。予定全体の通信量が半分になるという意味ではない。RSC初期転送も同率とは断定しない。
- 返却用の予定から不要な子配列を除く。`schedule-page-data.ts:74` のプロフィールも表示に必要な列へ投影できる。日別の出欠、メモ、権限表示は保持する。

### 3. フォロー0人でもタイムラインを最大5ページ追加取得する

- 根拠: `src/components/features/TimelineView.tsx:108,164`。フォローIDを把握していても、絞込後30件未満なら最大5ページを自動追加する。`src/app/(app)/timeline/actions.ts:16` の取得へ絞込条件は渡らない。
- 十分な過去投稿がある場合、フォロー0人の表示で最大5追加リクエスト・150投稿分を取得して非表示にする。
- フォロー0件と確認できた場合は追加取得しない。取得失敗を0件に変換しない。フォロー変更後の再評価、既読境界、既存cacheとページカーソルを維持する。一般の絞込をDBへ移す案は別の変更として扱う。

### 4. 画面外のつぶやき画像も先に読む

- 根拠: `src/components/cards/TweetCard.tsx:117` の画像に `loading="lazy"` がない。ノートの `NoteImages.tsx:19` と `NoteBody.tsx:64` は既に遅延読込済み。
- 画面外の投稿画像に遅延読込を適用し、見ないまま離れた投稿の転送を減らす。先頭の表示画像の遅延や、画像表示時の位置ずれが悪化しないことを確認する。実際に減る枚数・bytesは未計測。

### 5. マイページのグラフに不要な本文列・項目定義を取得する

- 根拠: `src/app/(app)/mypage/page.tsx:163` → `src/lib/queries/records.ts:30,37,45`。400日分の共通記録selectを使い、`src/lib/queries/internal.ts:12,19` の項目定義RPCも呼ぶ。
- グラフは `custom/menu_text/focus_text/項目定義` 等を使わない。専用のselectで不要列と追加RPCを省ける。
- グラフ詳細は結果・補強・感想を使うため、本文を全て削除しない。12か月表示、体調、距離計算、未来日/空記録の除外を保持する。

## 表示条件と取得範囲を合わせる候補

### 6. 練習メニューを表示していない予定でも毎分取得する

- 根拠: `src/components/features/ScheduleCachedView.tsx:38` は全予定を渡し、`ScheduleView.tsx:51` の表示分類は子に閉じている。`src/lib/client/middle-long-menus.ts:19` は60秒周期で対象月snapshotを読む。
- 対象ユーザーが「大会」などへ絞り込んでも取得が続く。可視状態で約60回/時のAPI呼出しが目安。
- 表示対象に練習がない場合は取得を停止し、対象月も表示する予定に合わせる。練習へ戻したときの取得、失敗時の既存メニュー保持を確認する。
- 背景poll停止、Homeの展開時取得、サーバーの60秒cacheと同時取得共有は実装済み。API回数とGoogle CSV取得回数は同じではない。

### 7. 大会結果が開催日外でも30秒ごとにページ全体を更新する

- 根拠: `src/components/features/ObLiveRefresh.tsx:16` は30秒ごとに `router.refresh()`。開催日や終了状態を判定しない。`readOnly` は文言のみ。`CompetitionMeetResults.tsx:12` でも使う。
- 可視・online・ダイアログなしの場合は約120回/時。可視復帰・onlineでも取得する。Next同梱ガイドのとおりServer Componentの取得処理も再実行される。
- 当日の運営鮮度を保ち、終了済み/開催日前の閲覧を低頻度化する。軽量な変更確認を挟む案は追加の複雑さと比較する。手動更新、他端末の更新反映、編集中保護を維持する。

### 8. ノートの件数表示に子記事・投稿の全IDを渡す

- 根拠: `src/lib/queries/notes.ts:8,51,61` は子記事・子フォルダ・スレッド・投稿のID配列を取得する。`src/lib/note-contents.ts:15` と `ThreadList.tsx:75` は主に配列の長さを使う。
- 閲覧可能な子だけの件数をDBで返す。ID配列が記事・投稿数とともに増える転送を、件数だけへ縮小できる。
- RLSで見えない子の数を漏らさない。現在はjoinで取得済みなのでN+1とは呼ばない。記事検索のサーバー検索は維持する。

### 9. 中長距離ランキングが全ブロックの生記録を読む

- 根拠: `src/lib/queries/rankings.ts:39` で月内の全ユーザー距離行を取得し、`:62` で集計、`:82` で対象ブロックに絞る。
- DB側で対象者を絞り、ユーザー単位の合計を返す。人数×記録数の転送を対象人数の集計結果へ減らせる。これは主にPC内DB→アプリの削減である。
- 距離のmax計算、「その他」、丸め順、複数所属、閲覧RLSを保持する。現在も列限定・プロフィール一括取得は実装済み。

### 10. ホームに大会の全運営データを取得する

- 根拠: `src/app/(app)/home/page.tsx:92` → `src/lib/queries/competition-meet.ts:7` → `supabase/migrations/20261012010000_competition_participants_appearances.sql:198`。全参加者・出場・競技・担当・役割を集約し、管理者には全部員も含む。
- `src/components/features/CompetitionMeetHomeCard.tsx:7` は一般部員には大会名とリンク、管理者にも本人の出場・担当だけを表示する。ホーム用の限定取得にできる。
- readyな大会がある場合の候補。実DBの適用・対象大会状態は未確認。Server Component内の取得なので、全情報をスマホへ送信しているという指摘ではない。本人の組情報と権限判定を保持する。

### 11. 小さい表示にも大きい画像を配信する

- 根拠: `src/lib/tweet-image.ts:5,26`、`src/app/api/note-image/route.ts:125` は最大1600px版を作り、`NoteImages.tsx:11,17` と `TweetCard.tsx:117,133` は一覧と拡大に同じ画像URLを使う。avatarも `src/lib/avatar-image.ts:2` の512pxを `Avatar.tsx:9` の32/40/64px表示に使う。
- 表示サイズ・端末解像度に合う縮小版を作り、拡大時に大きい版を読む。必要なサイズと圧縮率は見た目と実bytesで決める。文字が写る記録写真の可読性を保持する。
- アップロード時の圧縮・WebP化は既にある。サーバー再エンコードは入力検査を兼ねるため、単なる二重処理として削除しない。
- 非公開の認証/署名を維持する。Next同梱 `image.md:87` は標準最適化が元画像への認証headerを転送しないと説明するため、`next/image` への単純置換で済ませない。avatarの6日cacheは既存対策である。

## 定期処理・PC側の候補

### 12. Sheets同期が対象期間外の記録本文まで毎回取得する

- 根拠: `src/lib/sheet-sync/run.ts:105` は `SHEET_HISTORY_START`（3月23日）以降の全記録を全ページで取得し、本文/custom等も読む。`:280` で後から期間・初回/直近1か月を絞る。定期は1日1回、手動でも実行する。
- まず対象periodの下限・今日までの上限をDB条件へ移す。古いpending push/clear/未確認receiptに必要な記録は別途漏れなく含める。
- DB snapshotをCSV取得より先に読む順序、全ページ取得、競合検査、結果不明の再送禁止を保持する。件数とbytesは未測定。主にPC内のDB・JSON解析負荷の削減。

### 13. アプリ専用の人も送信待ちなしでCSVを取得する

- 根拠: `src/lib/sheet-sync/run.ts:135,465` はappOnly利用者もCSV取得対象とし、`:272` で取込みを省く。`src/lib/sheet-public-csv.ts:213` は時刻付きURL・no-storeで読む。signature一致は取得後の解析省略であり通信省略ではない。
- appOnlyかつ対象期間pending push・clear・未確認receiptなしを確認した人を、CSV取得対象から外す。
- 該当K人、CSV平均B bytesなら定期1回につき概ねK回・K×Bを削減できる。K/Bは未測定。必要な送信先照合、送信待ち、削除、結果不明処理を取りこぼさない。

### 14. 実行予定のないJobs周期も10秒ごとにAPI仕様全体を読む

- 根拠: `ops/pc-jobs/run.mjs:107,109` の約10秒tick → `scheduler.mjs:72` はdueJobsより先にready確認。`shared-pc.mjs:73,78` はbackendReadyが通るとversionとREST OpenAPIの2本を取得・JSON解析する。各ジョブ直前にも確認する。
- 10秒間隔と正常判定が続く仮定では、基礎分だけ約17,280 HTTP/日。処理時間によって実回数は減る。現PC主系では主にloopbackなので、スマホ通信・インターネット通信の削減量とは別である。
- 先に実行対象を算出し、ジョブ直前のready gateを維持する。停止設定・status heartbeatは軽量に継続する。バックアップの鮮度/本人環境/version確認を省いて仕事を実行しない。

### 15. バックアップ整理で同じ最新archiveを追加で全量GETする

- 根拠: `ops/local-minimal/offsite.mjs:106` の保存後独立GETに続き、`cleanup-runner.mjs:90` → `snapshot-cleanup.mjs:371,362` のdryRunが最新archiveを再び全量検証する。削除0件判定は後段である。
- 0件ならapplyを省く改善は反映済み。ここで指摘するのは残るdryRun側の追加読戻しだけ。
- 仮にarchive18MB、15分周期で96回/日、全周期でcleanup有効・候補0なら、追加GET1回分で約52GB/30日。実測ではなく削減余地の条件付き推計。削除候補がある周期は別に扱う。
- 候補0では計画確認まで、候補ありでは現行の完全検証へ進む構造を検討する。15分backup、保存後の独立全量読戻し、別DB復元、35分鮮度、削除直前の保護対象確認は維持する。検証結果共有を使うなら同一archive/hash/ETag/generationの範囲を厳密にする。

### 16. バックアップごとにアプリ配置全体のhashを作る

- 根拠: `ops/local-minimal/periodic.py:556` → `:190` → `runtime.py:357` はNext成果物・依存等の配置を読み直す。少なくとも成功backup周期に1回であり、全checkごとではない。storage-only確認や修正済みのtar header反復を重複計上しない。
- 10/17の配置記録38,735ファイルを96回/日と仮定すると約372万ファイル/日の確認。ファイル数×回数の推計で、実ディスクI/O・CPU時間ではない。OS cacheの影響も未測定。
- まずhash・dump・復元・送受信の時間を分けて測る。固定配置の変更を確実に検知する仕組みを保てる場合に、同一周期の検証結果共有等を検討する。mtimeだけの信用や完全性検査の停止はしない。

## 既に対策済み・今回の確定削減候補から外したもの

- JS/CSS等のcontent-hash付き `/_next/static/` は `public/sw.js:36` でcache-first。認証HTML/RSC/APIを一律に公開cacheへ変えない。
- 未読確認120秒、version確認5分、可視/online制御、SSR→React Queryの初回重複抑制、feed30件・social一括RPC、背景poll停止は既に実装されている。
- 起動時の4route手動prefetchは、同梱NextのAUTO・loading境界・共有の影響がある。4画面の全DB取得や二重通信と断定せず、HARで確認してから判断する。
- ガラスのアニメーションは収束時にrequestAnimationFrameを停止する。常時動く無限描画と決めつけず、標準ガラス・下部タブの直接透過を維持する。
- Sheets返信同期は廃止済み。過去文書の問題を現行機能として再列挙しない。旧mirror・旧クラウド構成のコードが残ることと、稼働していることを区別する。
- 全量backup自体はDB/Jobs/画像の完全な復元点を作る設計である。画像増加時の差分化は将来候補だが、復旧の複雑さを増やすため、まず15の重複除去を優先する。
- Vercelの重複buildは過去記録にあるが、現設定の再確認はしていない。設定変更は具体案の所有者承認が必要であり今回変更しない。

## 次に計測する場合の受入条件

1. 同じ端末・同じアカウントで初回/再訪を分け、ホーム・予定・タイムライン・画像拡大・いいね・コメントの1操作ごとにrequest数、転送bytes、待ち時間を比較する。
2. HTTP圧縮後の転送量とJSONサイズを区別する。バックアップのbytes・各段階の時間、Jobsのloopback回数はスマホ通信と別に集計する。
3. 投稿/出欠/コメントの保存結果、入力保持、他端末更新の鮮度、権限・非公開画像・失敗復旧が変わらないことを確認する。取得失敗を空表示に変えない。
4. cacheComponents/experimental.staleTimesを再導入しない。React Query、loading、診断記録を維持する。計測ログへcookie・署名URL・本文・秘密を残さない。

## 終了

上記16候補と既存対策をコード上で確認し、公開版SHAとの一致を確認した。主担当は画像/配信と統合、独立3担当はクライアント取得・サーバー取得・運用処理を読み取り調査し、既存修正と重複を照合した。

変更は本調査文書と索引のローカル追記のみ。コード修正、DB/環境/課金設定変更、サービス操作、同期/通知の再送、build/deploy/pushは行っていない。実装変更がないため全テストは再実行していない。実ブラウザでの個別再現、実通信量、電力、現在の対象件数、削減後の操作確認は未実施。

## 追加条件: Cloudflareのリクエスト上限に余裕を持たせる

2026-10-20、所有者の「CloudflarePagesの通信回数上限に触れないようにする」を受け、回数上限対策を削減案の必須条件に追加した。現在の陸上アプリはWorkers→VPC→PCの入口であり、Pagesへの移行済みとは扱わない。同日の別URL変更作業の文書も確認し、カラオケのPages移行候補と陸上アプリを混同しない。公開設定・URL・課金はこの調査で変更しない。

### 公式仕様と現在の数え方

- Workers Freeはアカウント単位で1日100,000リクエスト。Pages Functionsも同じ枠を消費し、UTC 00:00（日本時間09:00）にリセットされる。別WorkerやPagesへ分けても同一アカウントの枠は増えない。[Pages Functions公式料金](https://developers.cloudflare.com/pages/functions/pricing/) / [Workers公式上限](https://developers.cloudflare.com/workers/platform/limits/#daily-requests)
- Functions/Workerを実行せず直接返す静的ファイルは無料・回数無制限。Workers Static Assetsでも利用できる。`run_worker_first`で先にWorkerを実行するとその対象は枠を消費する。[Static Assets公式仕様](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/)
- Pagesを選ぶ場合も、静的ファイルをFunctionsの対象から外すルーティングが必要である。[Pages Functionsのルーティング](https://developers.cloudflare.com/pages/functions/routing/#functions-invocation-routes)
- 現コード `ops/pc-host/cloudflare/worker.mjs:31,50` は受け付けたrequestをPCへ転送し、`wrangler.example.json` に静的assetsの設定はない。この入口でPCから返すJS/CSS/画像は、ファイル種別が静的でも無料のStatic Assets配信にならない。内部のVPC dispatchまで日次incoming requestとして二重計上するものではない。
- 現アプリの同一origin画像は、cacheがない場合に認証付き画像APIの307と署名付き `/api/local-image` へのGETで公開入口を2回通る。署名URLの期限やブラウザcacheで実回数は変わる。

### 回数上限に対する優先順位

| 優先 | 対策 | 期待する効果と保持条件 |
| --- | --- | --- |
| 1 | 公開JS/CSS/フォント/ブランド画像をStatic Assetsから直接配信 | 初回訪問・新release・cache消失時も静的リクエストをWorker枠から除く。同originを維持し、公開ファイルを許可リストで抽出する。 |
| 2 | 不要な30秒/60秒取得を止める | 大会終了後・練習非表示など、表示に不要な周期だけを削減。当日の鮮度、手動更新、認証維持は守る。 |
| 3 | コメントの意図しない再取得・フォロー0件時の追加取得を止める | 実際のブラウザからのREST/Server Action呼出しを減らす。入力保持と結果不明の確認を維持する。 |
| 4 | 画像の画面外取得と余分なredirectを減らす | lazy化を先行。PC画像では認証/閲覧権限確認後に画像本体を返す方式等を検討し、未cache時の公開2requestを1requestにできるか検証する。単なる縮小画像はbytes削減であり、回数削減とは限らない。 |
| 5 | ブラウザcacheを活用する | 既存SWの `/_next/static/` cache-firstは維持。Worker内cacheだけではWorkerを呼んだ回数は消えない。非公開本文・画像を公開cacheに置かない。 |
| 6 | アカウント全体の実績と繁忙日の予測で余裕を確認する | カラオケ等の別アプリ、旧入口、確認用アクセスも含めて集計。アプリ単独が100,000未満という判定は使わない。 |

静的配信を実装する場合は、現在の公開originを保てるWorkers Static Assetsを第一候補とする。Nextの `.next/static` を `/_next/static` として配置し、許可した公開画像だけ加える。`.next` 全体、サーバー成果物、環境ファイル、ユーザー画像を静的公開しない。現在PCで動くSSR/Auth/APIはそのまま保つ。静的ファイルの404をSPAのHTMLへ置換しない。PCの公開SHAとassetsを一致させ、旧タブに必要な旧hash付きファイルの保持・切戻しも検証する。これは構成案であり未実装。

### 容量・PC負荷の対策と混同しない

- 出欠JSONの重複除去は1応答のbytes削減であり、通常request数は同じ。
- グラフの不要列・ノートの件数集約・ランキング・ホーム大会情報の限定は主にPC内DB/アプリ負荷の削減。Server Component内でDBクエリを減らしても、公開入口の回数がその分減るとは数えない。
- R2へ直接送受信するbackupやPCのloopback Jobsは、アプリ入口Workerの日次枠を消費するものではない。前記約52GB/月の推計を日次100,000回の回避効果として扱わない。R2自身のリクエスト枠は別管理である。
- 圧縮、304応答、Worker内cacheは転送量やPC負荷を減らせるが、公開Workerを実行する構成ならそのinvocationは残る。
- 縮小画像の後に原寸を開くと、別画像取得により回数は増える場合もある。縮小だけを回数削減として計上せず、lazy化・redirect削減と別に評価する。
- 未読120秒とversion5分の既存確認は、可視継続時に合計約42回/時/タブで公開入口を通る。非表示/offline/処理中/間隔未満の抑制は実装済み。SessionKeepAliveのSDK内30秒tickはローカル確認であり、30秒ごとのHTTPではない。期限接近時のsession更新を回数削減のため止めない。

### 計測と受入条件

- Cloudflareの実アカウントの日次合計・Worker/Pages別の実績を確認し、通常日と大会日の最大を比較する。今回、実利用量と契約プランは取得していない。
- 試算例: 100人が大会画面を8時間表示し、30秒ごとに1回更新すると、その更新だけで96,000回。利用人数・滞在時間の実績ではないが、背景取得だけで枠に近づく場合を示す。
- 設計上の暫定目安はアカウント合計で通常50,000回/日以下、繁忙日予測70,000回/日以下とし、他アプリ実績と合わせて再評価する。公式上限ではなく余裕を設ける計画値である。回数を満たすために保存・ログイン・必要な最新表示を黙って拒否しない。
- 静的assetだけを取得してもWorker invocationが増えず、ログイン・閲覧・保存・画像の権限・404・旧タブ・切戻しが保たれることを実経路で確認する。通常操作のHARとCloudflare集計を対応付け、HTML/RSC/API/Auth/画像/静的を区別する。秘密や個人本文を記録に残さない。
- 運用量の増加や予期しないアクセスもあるため、最適化だけで「絶対に上限へ到達しない」と保証しない。余裕が作れない場合は、所有ドメインからWorkerを介さず同じgatewayへCloudflare Tunnelで公開する別構成も比較対象になる。[公式の公開hostname構成](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/) から導く構成案で、ドメイン保有・費用・現URL変更指示との整合・認証を確認してから判断する。今回ドメイン購入や入口切替は行わない。

追加調査の終了: Cloudflare公式仕様と公開入口コードを照合し、回数に効く対策の順序・計測条件を追記した。本番変更なし、日次使用量未確認、上限回避の実装・効果検証は未実施。
