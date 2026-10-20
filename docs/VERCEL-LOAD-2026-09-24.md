# Vercel負荷削減（2026-09-24）

> **2026-09-25 夜の状態**: 外部メール監視はオーナー判断で取りやめたため、下にある「GAS監視」「署名health」「監視API」の連携は不要になった。REST中継はWorkerへの秘密鍵登録で停止中（このPCのwranglerは未ログインで、オーナーのCloudflareログインが必要）。PC定期処理への切替も未実施。

## 2026-09-25 再開時の実測（切替完了ではない）

再開後の進展: 所有者がworkers:write/workers_scripts:writeを明示許可し、認可更新成功。合成Worker `tuat-pc-rest-relay-synthetic.track-app.workers.dev` を配置（version `5596099a-260c-43aa-95ff-87dc917ce210`）、新規HTTPSの反映後、実ブラウザ8項目すべて成功。本番用 `tuat-pc-rest-relay.track-app.workers.dev` も配置（version `b17750fb-aa91-426d-987e-8bf5a447c967`）、匿名401・外部Origin403を確認。ただし既存中継秘密鍵のSecrets登録は自動承認レビューで別途明示承認を要求され、所有者へ確認中。秘密鍵未登録なので正規REST接続はまだ使えず、アプリ接続先も変更していない。拒否されたsecret bulkを迂回しない。

PC候補の445テストとTypeScript付き合成build成功。Vercel向け `.contingency/relay-cutover-20260925` も合成build成功。RESTを先行できるよう同候補の4cronをHEADどおりに戻した。候補をVercel既存tuat-tfへlinkした際の.env.localは開発用であり本番buildに利用しない。env pullのProduction sensitive値は[SENSITIVE]プレースホルダーであり実鍵ではない。ファイルはACL保護。PC設定の準備は既存GAS URL等の不足を検出して停止、未作成・未起動。公開中アプリのログイン試験は大学認証画面まで進み、所有者へ画面でのログインを依頼中。監視稼働確認・同期差分確認も引き続き必要。

所有者から本番切替を再度指示された。13:26 JST頃の読み取りで、本番PCのheartbeat/暗号化backup正常、maintenance=false。Vercel最新Productionは `0492e8ec13980f4ce7e6809bf3e64e734f4e45a5` / `dpl_3EpkoAoYg9J2ohVNpijULaPDuavy` / READY。

CloudflareはOAuthログイン済みだがscopeがaccount:read/user:read/workers:writeのみ。Workers一覧200で空、既存R2 bucketあり。公開先情報は403、合成Workerのdeployもアクセス権不足で失敗した。ログイン成功を公開権限あり・切替済みと解釈しない。workers_scripts:writeを追加するデバイス認可を準備したが、コード入力は自動承認レビューが明示承認不足で拒否し、所有者へ必要権限を説明して確認中。迂回操作なし。

`.contingency/pc-cutover-20260925` に上記HEAD＋対象src5ファイルの隔離PC候補を作成し445テスト成功。中継workerd9項目と実本番audit成功。候補のcrons=[]は公開していない。本番DB/Auth/cron/公開接続先/料金プラン/OSタスクはこの再開時点で未変更。

Vercel CLI使用量は9/3〜10/3期間、従量クレジット$20中$12.95消費・残$7.05。チーム全体の集計であり本番プロジェクト単独ではない。主要内訳はbuild $5.096、observability $2.59698、CPU $1.83915、memory $1.73484、origin transfer $1.31248。基本Pro $20は従量クレジットと区別する。

## 本番反映依頼後の確認（18時台、まだ切替未実施）

18:40頃追記: 所有者のCloudflareログインを確認。公式Wrangler 4.137.0を`.contingency/pc-relay-tools`へ隔離導入。account:read/user:read/workers:writeを要求するデバイス認可画面まで準備し、Background Accessを含む新規権限の許可は所有者に確認中。認可の最終操作・Worker公開はまだ実施していない。workerd9項目を再実行し成功。別作業のHEAD更新後、`eddaefeb7fa037b08ee403b9346e10f4e2a3aa73`＋対象src5ファイルで441テスト成功（隔離ディレクトリ名はpc-jobs-release-fdc9d03だが正確な基点はmanifestに記録）。

所有者から本番反映まで進める依頼を受け、配置前の確認を進めた。以下は以前の「環境未確認」「承認待ち」より新しい状態。

- このPCの稼働中backendを確認。maintenance=false、期限なし、heartbeat/暗号化backup正常。権限付き読み取りでは設定が見えるため、通常権限で読めないことを「別PC」と判断しない。
- 本番Auth設定200、匿名/偽造JWT/管理API/外部Origin/トンネル直接接続の拒否を既存auditで確認。新Worker経由の認証試験とは別。
- Vercel認証を更新し、公開versionは`3f74157feab918d7e092720f2b06f7761c35b202`を確認。
- 同期の既存秘密設定をGoogle同期プロジェクトから読み取り、ACL付きGit対象外ファイルへ保存。鍵の変更・表示はしていない。
- 本番の既存APIへdryRunのみ実行。記録同期HTTP200/失敗0、予定差分はinserted609・updated0・pushed1。大会同期HTTP200/1大会/失敗0。これらは予測値で、同期や書込みを実行した数ではない。記録差分とスナップショットを切替前に確認する。
- 外部GAS監視の独立プロジェクトを作成し既存監視コードを配置済み。メール送信・トリガー起動は未実施。監視API/DB依存関係とjobs監視の統合、Google初回認可、異常/復旧通知の確認が残る。
- Cloudflare管理画面は未ログイン。所有者へログインを依頼済み。Workerの公開・接続先変更は未実施。
- 最新HEAD＋今回のsrc5ファイルだけの隔離コピーで441テスト、PC向け合成設定build（TypeScript/63 static pages）成功。runner11テスト再成功。合成成果物を本番へ配布しない。

本番アプリ・DB/Auth・公開接続先・4cron・OSタスク・料金プランはこの作業では変更していない。外部監視プロジェクトの準備だけが外部への変更。Cloudflare公開試験、認証/保存の通し確認、監視稼働確認と同期差分の確認を完了してから段階切替する。

## 最新追記：定期処理本体のPC移設候補（本番未反映）

オーナーの追加依頼により、DB中継に加えて4本の定期処理もVercelから外す候補を実装した。
`ops/pc-jobs/`が、現行アプリの同じNext APIをPCの127.0.0.1専用サーバーで実行する。
単にVercelのAPIを別サービスから叩く方式ではない。通常の予定頻度は維持し、全4本で名目314回/日のVercel cron起動と、その定期処理本体をPCへ移す候補。手動操作分はVercelに残る。

dispatch前の永続記録、切替境界、単一runner排他、停止復帰時の最新枠実行、失敗/成否不明の保留、バックアップ/maintenance確認を追加。
個人情報のない署名付きhealthをR2へ送る仕組みと、Workerの認証付き監視API、既存GAS監視への追加候補も作成した。メール送信・GAS公開は未実施。
これはexactly-onceや完全な取りこぼし防止を保証しない。旧cron・手動同期との同時実行を避ける切替手順と、成否不明時のデータ確認が必要。

基点は最新HEAD `319f550a286743d8cdf3714f03c97b2348ee59f4`。今回のsrc5ファイルだけを足し、PC/Vercelの隔離候補を作成。
440テスト、両候補の合成設定build（TypeScript込み）、実ローカルNextの認証拒否確認、Node隔離11項目、workerd9項目、対象eslint成功。
PC候補は `http://127.0.0.1:8000`、Vercel候補は従来のPC中継を使う。秘密値を含まない合成buildであり、その成果物を本番へ公開しない。

本番のvercel.jsonは4cronを保持したまま。crons=[]は.contingency内の候補だけ。
本番DB・公開接続先・OSタスク・GAS・Workers・Vercel・料金プランは変更していない。
Workers公開/実ブラウザ確認、本番PCでの設定確認・同期dryRun・外部監視稼働確認、初回実行の監視、使用量測定が本番切替までの残条件。
cronの無料プラン制限はこの切替で解消するが、CPU/転送量・利用条件を確認するまでVercel無料化は確定しない。

詳細な検証範囲、設定、切替、異常時復旧、切り戻しは [PC定期処理の手順](../ops/pc-jobs/README.md)。下記は先行DB中継実装時の記録。

## 今回の実装（本番未反映）

旧アプリのPC運用用ブラウザSupabaseクライアントで、同時に発生する同一GET/HEADを1回にまとめる。URL・認証ヘッダー・取得条件・fetchオプションが同じ場合だけ共有し、レスポンスは呼び出し元ごとに複製する。完了後は保持しない。書き込みは共有・再送せず、書き込み開始後の読み取りは以前の取得に合流させない。個別AbortSignal付きとRequestオブジェクトの呼び出しは共有対象外。

UI、DB、認証方式、接続先、cron、公開設定は変更なし。Cloudflareへの移行ではない。

検証: 合成同時10取得が1回になること、本文の独立消費、ユーザー分離、条件分離、キャンセル分離、書き込み非共有、失敗後の再取得を4テストで確認。全430テスト、TypeScript、対象eslint成功。本番ビルド・本番使用量の前後測定は未実施。本番全体の削減率は不明。

## 残る構造的な負荷

現在ブラウザのDB通信は `/api/pc-supabase` → Cloudflare Tunnel → PC。トンネル利用だけではVercel中継の実行はなくならない。今回減るのは同時重複だけで、通常の独立した取得・保存は引き続きVercelを通る。

大幅削減の次段階は、このAPI中継を別基盤へ分離すること。Cloudflare Workers候補について、利用可能なアカウント・固定API公開先、厳密なOrigin制限、JWT/RLS維持、秘密鍵のサーバー限定保管、署名付きPC接続先探索、OAuth/セッション更新、障害時挙動を検証してから接続先を切り替える必要がある。SSR/Server Actions/画像/cronは別途Vercel側に残るので、中継移設だけでVercelゼロとはならない。

切替前後は同じ期間・人数条件でVercelのリクエスト/実行時間/転送量を比較する。現時点で無料枠達成や削減率を保証しない。大会関連など別作業の未公開変更を同時デプロイしない。

## 続きの調査・実装（2026-09-24、本番未反映）

本番公開 `/api/version` は `d5cbe24811a9cd67ce07ddf43942080d634feaf6`、作業基点HEADと一致。
`src/lib/supabase/client.ts` → Vercel `/api/pc-supabase` → `pcBackendFetch` → R2署名付きendpoint → Tunnel → PCゲート、という引継ぎの経路をコードで確認した。
この作業PCのstatusにはheartbeat/backupがなく、現在の本番ホストとして扱わない。DB操作・PC再起動は一切していない。

読み取り専用の単発測定（並列3リクエスト、Node fetch、2026-09-24）:

| 経路 | status | 経過時間 | 応答本文bytes |
|---|---:|---:|---:|
| `/api/version` | 200 | 516ms | 54 |
| `/api/pc-supabase/auth/v1/settings` | 200 | 912ms | 603 |
| 匿名REST | 401 | 455ms | 26 |

Google認証有効・signup可能も公開設定で確認。上表は回線待ちを含む単発応答時間と非圧縮本文サイズであり、Vercel Active CPU/実行時間/Fast Origin Transferの測定ではない。
Vercel connectorはこのセッションに無く、引継ぎ内のCLI位置も利用不能。最新の課金使用量・経路別件数・最新の削減率は取得できていない。9/21の概算を現在値として再利用しない。

## 移設対象と残る負荷

| 種別 | 今回の候補構成 | Vercelに残るもの |
|---|---|---|
| ブラウザSELECT/HEAD・CRUD・RPC | Workers → Tunnel → PC | 新bundleでは該当REST中継を通らない。旧タブは旧経路のまま |
| Auth user/refresh/logout/PKCE/OAuth | 既存経路維持 | Auth中継、Google callback、セッション処理 |
| SSR/Server Actions/API handlers内DB取得 | 既存pcBackendFetch | レンダリング・サーバー処理・外部待ち・転送 |
| 画像 | 既存R2/画像API | 認証付き画像API、圧縮・アップロード等 |
| cron/同期/通知 | 停止・頻度変更なし | sheets日次、schedule毎時、program5分ごと、cleanup日次ほか既存処理 |
| 静的JS/CSS/PWA | 既存配信 | CDNリクエスト、配信量 |

現在の `vercel.json` は大会program同期が5分間隔。9/21文書の「日次」は現在のコードと一致しないため採用しない。
既存visible-pollは非表示・offline時の抑止と重複実行防止を持つ。今回は必要な通知/プログラム確認の間隔を変えない。
DBを移すのではなくREST中継を移すため、PC側DB処理件数は同時重複統合の分以外は減らない。

## 実装内容

`ops/pc-rest-relay/worker.mjs` と `src/lib/pc-browser-transport.ts` を追加。公開環境変数 `NEXT_PUBLIC_PC_REST_RELAY_ORIGIN` が未設定なら既存経路。
設定時だけREST/RPCを固定HTTPS Workerへ振り分け、Auth URL・Cookie名・OAuth・SSRは維持する。公開変数にはURLのみで、秘密鍵は入らない。
厳密なCORS、member Bearer転送、既存JWT/RLS、署名付き接続先、期限、本文サイズ、no-store、redirect拒否、書込非再送を実装。
詳しい設定・影響・段階切替・切り戻し・対象ファイルは 当時のrelay手順（旧 `ops/pc-rest-relay/README.md`、撤去済み。現行は [PC host](../ops/pc-host/README.md)）。

前のcoalesced-fetchは、実SDK経由でも同時SELECT10→1、HEAD count10→1を確認した。ただし同時重複のみの効果であり全体の90%削減ではない。
追加レビューで「保存中に開始した古い取得へ、保存完了後の取得が合流する」可能性を修正。書込開始時に加えて完了時にも合流候補を破棄する。レスポンスの永続キャッシュは作らない。

## 現行公式料金・制限（2026-09-24確認）

- [Workers料金](https://developers.cloudflare.com/workers/platform/pricing/): Free 100,000要求/日、CPU 10ms/呼出。Paidは月$5から、1,000万要求と3,000万CPU-ms込み。超過は100万要求あたり$0.30、100万CPU-msあたり$0.02。待ち時間とCPU時間は別。
- [Workers制限](https://developers.cloudflare.com/workers/platform/limits/): Free枠超過時の停止リスクがある。CORS OPTIONSもWorker要求なのでREST本数だけで見積もらない。実CPUはCloudflare上で要測定。
- [R2料金](https://developers.cloudflare.com/r2/pricing/): StandardのClass B無料枠は1,000万/月、超過$0.36/100万。今回のWorkerはREST1回につきendpoint GET1回、OPTIONSには不要。既存画像/backupの利用枠と合算される。
- [Vercel使用量](https://vercel.com/docs/pricing/manage-and-optimize-usage)・[CDN課金](https://vercel.com/docs/manage-cdn-usage): 呼出回数、Active CPU、Provisioned Memory、Fast Origin Transfer、Fast Data Transferを別々に比較する。中継除去だけではSSR等は消えず、無料運用は未実証。

## 検証済みと未検証

- 作業ツリー全439テスト、TypeScript、対象ESLint成功。別作業のテストも含む。
- HEAD d5cbe24＋今回のsrc5ファイルだけの隔離コピー: 425テスト成功。合成PC設定＋候補relay URLによるNext本番形式build成功（TypeScript・63 static pages生成）。本番秘密値を用いたbuildではない。
- 実Supabase SDKでSELECT/HEADの重複統合・件数・Bearer転送・REST宛先・Auth非変更を確認。INSERT/UPDATE/DELETE/RPC通信切断時の非再送を確認。
- workerd/一時R2の合成環境で8項目成功: Origin/匿名/privileged role/API制限、CORS、JWTとquery転送/内部ヘッダー除去、upstream401/403、保存本文/失敗非再送、1MiB制限、期限/署名/instance不一致、PC503/redirect拒否。期待するupstream7回と一致。
- 本番SupabaseのRLSをこの試験で再実証したわけではない。Googleログイン・期限切れrefresh・logout・OAuth戻り・実ユーザー保存・iOS PWAの通し確認は未実施。隔離公開HTTPS試験と本人限定の本番確認を段階切替の必須ゲートにした。
- commit/push/deploy、Cloudflareリソース作成、接続先/env/Auth/DB設定変更は未実施。

## 使用量比較の手順

承認後、切替前後で同じ曜日・時刻の24時間以上を比較し、利用者数・大会開催/同期の有無も記録する。
Vercel Usage/ObservabilityからprojectとProductionを固定し、REST中継/Auth中継/SSR/画像/cronの経路別件数、status、p50/p95 durationを取得。請求単位のCPU・memory・Origin Transfer・Data Transferは同じ期間で別欄に保存する。
Workers側では要求数（OPTIONS別）、status、CPU、duration、R2 Class Bを記録。URL query/JWT/body/個人データはログへ出さない。標準詳細ログは本設定で無効。
成功条件はREST中継の減少に加え、401/403/5xx増加なし、refresh後の保存成功、表示データ/件数一致、二重保存なし。旧タブ分とSSR分を含めてVercel全体の実削減率を算出する。
