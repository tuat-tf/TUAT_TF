# 公開費用・無料化の調査（2026-10-08）

担当: Codex。所有者の「Cloudflare Pagesにしたら無料にならないか」「諸々調査して」を受け、現行アプリの料金・使用量、無料枠適合、負荷削減、ホスティング移行を調査する。

範囲: 既存認証を使うサービスの読み取り、公式資料、現行ソースと最新masterの比較。料金プラン、ビルド設定、公開先、DB、環境変数、通知、定期処理は変更しない。休止中新アプリを再開しない。秘密値・個人情報・API原文を公開記録へ含めない。

## 開始時の保全・基点

- 開始HEAD `3dc1714`、ブランチ `fix/ob-dns-records-20261008`。既存の多数の未コミット変更を保持する。
- Git対象外の `.contingency/hosting-cost-20261008/preservation/` にtracked/stagedのbinary patchと既存未追跡59ファイルを退避した。秘密・既存作業の退避は公開しない。
- `git pull --ff-only origin master` は、既存の `docs/README.md` 変更を上書きするため安全に中止された。最新 `origin/master` は `7786c34`。stash/resetせず、読み取り時に最新masterとの差を照合する。
- 調査開始時のアプリ本体・公開構成には変更なし。日付付き記録と索引の追加のみ手元に保持する。

## 判定条件

月額サービス料金を下げても、ログイン・期限更新、権限、保存と失敗後の復旧、画像の非公開性、PC停止時の操作、既存定期処理と予備同期を維持する。利用者数や通信回数だけでCPU枠適合と扱わない。現状値・単純外挿・未測定の改善案を分けて判断する。

## 調査結果

2026-10-08 16:42〜16:50 JSTに既存認証でVercel Usage/Metrics、CloudflareのR2/Workers集計、Supabaseの組織プランを読み取った。公式の無料枠・互換性も同日確認した。以下はAPIの集計値であり、請求書・税・為替・決済額の確認ではない。個人情報・秘密値・アカウントID・署名URLは記録しない。

### 結論

現状のままVercel Hobbyへ戻すと、CPU・Function回数・Origin Transferが無料枠を超えるペースである。Cloudflare Pagesの静的公開へ設定を変えるだけでも移行できない。現行アプリはSSR、Server Components、Server Actions、API、認証proxyを利用するため、Cloudflareでの移行先はWorkersが候補になる。

無料を目指す第一段階は、実測で重いアバター認証・URL発行、ホーム/タイムラインのSSR、シート見出し処理を削減し、Hobbyの枠へ収まるか再測定すること。CPUは約76%削減が必要で、アバター単独の改善だけで達成するとは判断できない。Hobbyの個人・非商用利用条件も別に満たす必要がある。

Workersへの移行は無料枠での試験価値があるが、1リクエスト10msのCPU制限、画像処理の置換、Next互換性を未検証のため無料運用を約束できない。無料枠に収まらなくてもWorkers Paidの基本料金は月$5からで、Vercel Pro月$20より下げられる可能性がある。超過使用・追加サービスは別途確認する。

### 1. Vercelの現在値と無料枠との差

現在のProは月$20、Developer seatは1席で基本料金に含まれ、追加席は0。使用量credit $20のうち$3.23を使用し、残り$16.77だった。表示上の固定料金と従量原価の合計$23.23を「追加請求$23.23」と読まない。現時点の使用分はcredit内である。[Proの料金構成](https://vercel.com/docs/plans/pro-plan)

請求期間は2026-10-03 16:00〜11-03 17:00 JST（31.0417日）。10/8 16:44時点まで約5.031日を、同じペースで期間末まで単純外挿した。大会当日などの変動は含まない。

| 指標 | 期間内の取得値 | 同じペースの期間末推計 | Hobbyの無料枠 | 枠へ収めるための削減率 |
| --- | ---: | ---: | ---: | ---: |
| Active CPU | 2.652時間 | 16.36時間 | 4時間 | 約76% |
| Function Invocations | 197,436回 | 約121.8万回 | 100万回 | 約18% |
| Fast Origin Transfer | 2.467GB | 15.22GB | 10GB | 約34% |
| Provisioned Memory | 20.04GB時間 | 123.6GB時間 | 360GB時間 | 現ペースでは不要 |
| Fast Data Transfer | 1.537GB | 9.48GB | 100GB | 現ペースでは不要 |
| CDN Requests | 約11.19万回 | 約69.0万回 | 100万回 | 現ペースでは不要 |

無料枠の根拠は[Hobbyの現行表](https://vercel.com/docs/plans/hobby)。Hobbyは超過後に追加従量料金で継続するプランではなく、多くの機能では次の枠回復を待つ必要がある。CPUはVercelの日別集計（America/Los_Angeles）でも10/3〜10/7に毎日0.46〜0.68時間あり、最初のビルドだけの一時負荷ではない。

現在の従量原価の主な内訳はBuild CPU $0.910、Origin Transfer $0.666、Observability events $0.661、Active CPU $0.535、Memory $0.334、Functions $0.118。全体を同じペースで外挿すると約$19.9であり、今回の5日間だけから今月の追加請求発生を断定できない。枠ぎりぎりの推計でもあり、残額を将来保証しない。

Build CPU 260分のうち、現行本番プロジェクトは116分/$0.406、旧PC previewプロジェクトは144分/$0.504だった。旧previewが約55%を占めるため、今も必要な公開先か照合したうえでビルド停止を検討する価値がある。ただし停止だけでProの固定$20や本番CPUの無料枠超過は解消しない。Ignored Build Step等の具体的設定変更はAGENTSのオーナー承認対象であり、今回変更していない。

Hobbyは個人・非商用利用のみ。非営利の部活動という理由だけで適用可能と確定しない。Git remoteは個人アカウント配下だが、GitHub所有者と実際の利用条件は別である。非公開の組織リポジトリには別の制約もある。ダウングレード時には開発者のVercelチーム参加、関連サービス、更新日を確認する。規約上ダウングレードは次回更新日から有効で、操作当日に既存の請求がなくなるわけではない。アプリの部員アカウント数とDeveloper seat数は別物。[利用条件](https://vercel.com/docs/limits/fair-use-guidelines) / [Gitのプラン制約](https://vercel.com/docs/git#using-hobby-teams) / [更新日とダウングレード](https://vercel.com/legal/terms)

### 2. どの処理が重いか

Productionのroute別Metricsで取得したCPU合計は1.382時間。請求用Usageの2.652時間とは一致しない。CPU Metricsの窓はAPI側で10/3 00:00〜10/9 00:00 UTCの日単位へ丸められ、回数・転送は10/3 04:00〜10/8 08:00 UTCの4時間単位へ丸められた。異なる定義・窓の集計なので、下表の割合を請求CPU全体の削減率と扱わない。[Usage CLI](https://vercel.com/docs/cli/usage) / [Metrics CLI](https://vercel.com/docs/cli/metrics)

| 経路 | 取得CPU | このroute CPU集計内の割合 | 回数集計の取得値 |
| --- | ---: | ---: | ---: |
| `/api/avatar/image` | 0.505時間 | 36.5% | 34,298 |
| `/home` | 0.248時間 | 17.9% | 10,385 |
| `/timeline` | 0.185時間 | 13.4% | 10,944 |
| `/api/sheets/header` | 0.073時間 | 5.3% | 2,909 |
| `/mypage` | 0.063時間 | 4.6% | 8,815 |
| `/schedule` | 0.062時間 | 4.5% | 8,550 |
| `/competitions/[id]/program` | 0.055時間 | 4.0% | 1,367 |

アバターAPIのstatus別集計は日単位の上記CPU窓で307が35,383件、取得した他status行は0だった。少なくともこの集計ではエラー再送より正常な署名URL発行が主体である。画像の実bytesは署名URL先のR2からブラウザへ届く。routeのOrigin Transferを、そのままVercelが中継した画像bytesと説明しない。

改善候補は以下。実装・ブラウザ再現・削減率測定は今回行っていない。

1. **アバターの認証・URL発行**。`src/app/api/avatar/image/route.ts` は毎回 `getUser()`、R2 HEAD、署名URL生成、307を行う。成功応答は6日間のprivate cacheと `Vary: Cookie`、署名URLは7日間有効。トークン更新や設定cookieの変化で別cache variantになる可能性があるが、実ブラウザの再取得原因は未確認。毎renderの時刻cachebusterはない。まず同じ画像URLの再取得、Cookie変化の有無だけ、HEAD/署名時間を秘密値なしで測る。検証済み本人IDの `getClaims()` 利用、認証後のアバター用HEAD/署名の同時要求集約、画面外の一覧画像のlazy loadが候補。public cache化やR2公開化、`Vary`の無条件撤去は行わない。失敗応答の再試行・有効期限・画像差替え・ログアウト・別利用者を確認する。[getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)
2. **シート見出しだけの処理**。`src/app/api/sheets/header/route.ts` は見出しだけを返すが、呼び出す `fetchPublicMember()` は内部で `fetchPublicMemberSnapshot(..., {forceParse:true})` を指定し、全CSVのhash、全行parse、記録の日付・cell・返信まで構築して捨てている。見出し専用の正しいCSV parseへ絞る余地はコードで確認できた。先頭15行の「日付」行、空欄を含む元column index、member/GID照合、閲覧者別のblock/signatureを維持する。`SheetHeaderGuard` の配列参照依存による同内容の再取得も候補だが実頻度は未測定。保存直前の最新列照合は保持する。CPU削減とCSV取得bytes削減を区別する。[Papa Parse preview](https://www.papaparse.com/docs)
3. **ホーム・タイムライン等のSSR**。CPU順位に基づきプロフィール/権限の重複確認、必要な列とpayloadを測定して絞る。`schedule-page-data.ts` ではattendanceをschedule内と別mapの双方へ渡し、表示用本人情報にもprofile全体を渡す箇所がある。データを欠落させずに重複を減らせる候補。今回の集計だけで特定DB問い合わせを原因と断定しない。
4. **OB戦の30秒全体更新**。`ObLiveRefresh.tsx` は画面表示中・online・dialogなしで30秒ごとに全体SSRを更新する。部分snapshot/version確認へ絞る候補がある。今のroute CPU順位では上記より低いが、大会当日の同時利用に備えて確認する。単純な間隔延長は鮮度を落とすので、30秒で他人の変更が届くこと、編集dialog保護、権限、保存後復旧を維持して検証する。

既に `/api/version` の静的化、通知の表示中2分poll、通常大会の当日5分部分更新、SessionKeepAliveの無条件router refresh撤去がある。作り直さない。Splash等のprefetch回数を、全画面のSSR回数と推定しない。PCの予備同期・job journal・障害切替を費用削減のために弱めない。

### 3. Cloudflare・Supabaseの現在値

R2は対象アカウント内の1 bucketを読み取り、10/8 16:10 JSTの最新sampleで414 object、内容647,903,093 bytes、metadata込み647,966,666 bytes（約0.648GB）。瞬間容量であり月間GB-monthの確定請求値ではない。

10/1 00:00 UTC〜10/8 07:50 UTCの操作集計は、Class A対象が35,729回（PutObject 35,667 + ListObjects 62）、Class B対象が153,205回（GetObject 95,360 + HeadObject 57,845）。R2 Standardの無料枠10GB-month、Class A 100万回、Class B 1,000万回と比べ余裕がある。同じペースの31日外挿でも約15.1万/64.8万回。statusを条件にしていない操作集計なので「全件成功」とは説明しない。現在の請求書や契約を取得したものではなく、Standardの無料枠との比較である。[R2料金](https://developers.cloudflare.com/r2/pricing/)

既存REST relay Workerは10/1〜10/7 UTCの日次requestが3,087〜4,435回、10/8は途中時点1,175回。取得集計のerrorsは0だがclientDisconnectedもあるため、全保存処理の成功証拠にはしない。現在のrelayの要求数が少ないことは、Next SSRを移しても無料枠へ収まる証拠にはならない。Cloudflareのsubscription APIは403で、Workersの契約プラン・当月請求額は今回確認できていない。

Supabaseは10/8 16:47 JSTの組織プラン取得でFreeを確認。月間MAU・egressの残り枠は未取得。Management APIの短期間api-countsはMAU/bytesではなく、今回の公開API経路だけでは月間Usageを確定できない。既存認証済みダッシュボードもブラウザにないため、未確認として残す。Freeの公称枠は50,000 MAU、DB 500MB、egress 5GBだが、過去の容量測定を現在値に読み替えない。[料金](https://supabase.com/pricing) / [MAUの確認方法](https://supabase.com/docs/guides/troubleshooting/check-usage-for-monthly-active-users-mau-MwZaBs) / [egressの確認方法](https://supabase.com/docs/guides/platform/manage-your-usage/egress#view-usage)

通常DBはPCのWSL Supabase、認証はクラウドSupabase、画像は非公開R2、ブラウザRESTは既存Cloudflare relay、定期処理はPC。Vercel cronは0。公開先を変えるだけならD1へのDB再設計は不要で、既存のPC/クラウド切替と予備同期を維持する。

### 4. 公開先の比較

| 候補 | 月額サービス料金の可能性 | 現行アプリでの判定 |
| --- | --- | --- |
| Vercel Hobby | $0 | 改修が最小。現ペースではCPU等超過。CPU約76%削減と利用条件の確認が必要 |
| Cloudflare Pages静的公開 | $0 | 現行SSR・認証proxy・Server Actionsをそのまま載せられない。静的SPA化は大きな設計変更 |
| Cloudflare Workers Free | $0 | full-stackの移行候補。10万dynamic requests/日、CPU 10ms/HTTP request。Next互換性と画像処理、実負荷は未検証 |
| Cloudflare Workers Paid | $5/月から | FreeのCPU制限が難しい場合の節約候補。移行作業は必要。超過・関連サービスで合計が増える場合あり |
| Netlify Free | $0 | Next対応はあるが300 credits/月をデプロイ・通信・関数で共用。現状負荷の移し替えだけでは不足しそう |
| 既存PCでNext + Cloudflare Tunnel | ホスティングサービス料を$0にできる余地 | native Next/Sharpを維持可能。PC停止でアプリ入口も停止し、クラウドDB予備へ操作する現在の仕組みを失う。電気・回線・独自ドメイン費は別 |

Cloudflareの最新公式Next.js案内は、既存Next16へ追加できるvinextを既定の候補にしている。vinextはbetaなので、現行の認証proxy、RSC、Actions、redirect、cacheの互換性を独立環境で検証する。OpenNext経路も残るが、Node Middleware非対応のため `src/proxy.ts` を含む適合確認が必要。昔の「Pages + next-on-pages」や圧縮bundle 3MBの記述を現行条件として使わない。[Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) / [OpenNext経路](https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/) / [Pagesは静的export](https://developers.cloudflare.com/pages/framework-guides/nextjs/)

Workersの現行上限はFree/Paidともmemory 128MB、非圧縮Worker bundle 64MiB。Freeはネットワーク待ち時間を除いたCPU 10ms/HTTP request。静的assetの直接配信は無料だが、先にWorkerを実行する構成ではdynamic requestsになる。既存VercelのCPU平均をそのままWorkersの1requestへ換算しない。[制限](https://developers.cloudflare.com/workers/platform/limits/) / [料金](https://developers.cloudflare.com/workers/platform/pricing/)

Netlifyのcredit単価はProduction deploy 15、帯域1GBあたり20、Web requests 1万回あたり2、Function compute 1GB時間あたり10。仮にVercelでの期間末推計9.48GBとCDN requests約69万回が同じ課金定義になれば、この2項だけで約328 creditsになり300を超える。提供者間で計測定義が異なるため確定見積りではないが、deploy/computeを加える前から枠に余裕がない。Freeはauto rechargeで課金する方式ではなく、枠到達で停止する。昔の100GB/月というFree枠は現行credit planの根拠に使わない。[credit料金](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/) / [Next対応](https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/)

PC + TunnelではNextのNodeサーバーをそのまま動かせる。安定した本番用Tunnel hostnameにはCloudflare管理下のドメインが必要で、その取得・維持費は別。Quick Tunnelは一時的な開発向けで、200同時request・SSE非対応等の制約もあり本番予備にしない。[Next自己ホスト](https://nextjs.org/docs/app/guides/self-hosting) / [Tunnel要件](https://developers.cloudflare.com/tunnel/get-started/#prerequisites) / [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

### 5. Workers移行で具体的に変えるもの

- **画像upload 3経路のSharp**。アバター・ノート・つぶやきのnative SharpはそのままWorkersで動かせない。SharpのWasm版にも必要なthread要件があり、単純なdependency差替えで解決済みとは扱わない。Cloudflare Images bindingでupload bytesを処理し、R2へ保存する案がある。Freeの変換は月5,000 unique transformationsまでで、超過時は新しい変換が失敗するため件数を確認する。Imagesの有料storage/deliveryへ画像を移すことは必須ではない。現行の2/3MB入力制限、50MP上限、回転補正、アバターcrop、1600px resize、WebP品質、metadata除去を照合する。R2保存後のDB保存失敗・削除・再試行も維持する。[Sharp install](https://sharp.pixelplumbing.com/install/) / [Workers Wasm](https://developers.cloudflare.com/workers/runtime-apis/webassembly/) / [Images binding](https://developers.cloudflare.com/images/optimization/binding/) / [Images料金](https://developers.cloudflare.com/images/pricing/)
- **originと認証**。`next.config` のVercel origin条件、relayのAPP_ORIGIN、metadataBase、Google OAuth/Supabase callback・redirectを新originへ対応させる。初回SSR、期限更新、一時通信失敗でcookieを消さないこと、検証済み本人ID、RLS/役割を確認する。
- **PWAと通知**。新originには旧originのcookie・Service Worker・push購読が引き継がれない。iOS/Androidでログインとホーム追加、通知登録・旧購読整理を検証する。ブラウザ合成確認で実機済みとはしない。
- **Node依存とbuild**。crypto/Buffer/AWS SDKはnode compatibilityで適合する可能性があり、使用しているだけで不可と決めない。Drive credentialのfs fallback、runtime env、bundle/startup/CPU、外部接続数を測る。本番依存を消して試さず分離する。
- **障害切替**。PC停止検知は約3分の有効期間を持つ。WorkersからもPC停止中のクラウド操作、その後の書戻しを同じ条件で確認する。ホスト移行をDB migrationと混同しない。

### 6. 推奨する進め方と受入条件

1. 負荷削減は無料枠判定へ直接効くアバター・SSRと、コードで不要処理を確認できた見出しから始める。旧PC previewのビルド用途も確認する。改善前後を同じ窓・同じ利用操作で比較し、請求CPU・関数回数・Origin Transferを再測定する。
2. Hobbyにする場合は個人・非商用条件と移管対象を確認し、4 CPU時間/100万Functions/10GB Origin以下に大会当日の余裕を含めて収まることを確認する。無料枠の上限ぴったりの外挿だけで切り替えない。
3. 削減幅が足りない場合、既存本番を維持したままWorkersの独立origin・セッション・DBで試験する。vinext/OpenNextの適合とSharp置換を検証し、主要操作と大会相当の同時閲覧で10ms CPU等を測る。無料枠適合が確認できれば$0を目指し、難しければPaid基本$5と従量分を評価する。
4. 移行の受入条件は、通常のログインから期限更新、ホーム/タイムライン/予定/ノート表示、本人と権限別の保存・削除、画像差替え・非公開性、同時編集と結果不明の復旧、PWAと通知、PC停止中の保存から復帰後書戻しまで。同じURLの表示だけを移行完了としない。切替前の戻し先を維持し、実測と具体的構成がそろった段階で公開先・Vercel解約を決める。

### 7. 検証範囲・未確認・終了状態

- 確認済み: 現在のVercelプラン/credit/使用量、project別・日別内訳、Productionのroute別CPU/回数/転送/status、R2の容量・操作、relay Worker日次集計、Supabase組織Free、現行ソースと公式料金・対応機能と制限の記述。
- 最新 `origin/master` `7786c34` と開始HEADの差は主に予定の集合時刻・全画面表示等の12ファイル。今回の認証・画像API・polling・公開先の判断に影響する変更はなかった。OB refreshと画像経路も最新masterで照合した。
- 未確認: 請求書・税・為替、Cloudflare契約/請求、Supabase月間MAU/egress、Vercelとroute Metricsの定義差、大会の将来ピーク、ブラウザのアバターcache miss原因、改善後の削減率、Workers上のbuild/runtime/CPU、PWA実機・移行操作。本番のDB/利用者情報を取得する試験は行っていない。
- 証跡用のスクリプトと集計JSONはGit対象外の `.contingency/hosting-cost-20261008/` に保存。公開記録には集計値のみ記載した。CLIの既存認証は読み取りにだけ使用し、tokenは表示・保存していない。
- 作業前後のtracked binary patchを比較し、索引を除く既存75ファイル分の差分が完全一致することを確認した。調査文書の数値再計算、索引リンク、`git diff --check`も確認した。
- 今回変更した成果物はこの文書と `docs/README.md` の入口のみ。アプリコード・料金プラン・Vercel設定・Cloudflare公開先・DB・環境変数・定期処理に変更なし。文書のみのため型検査/test/build/deployは実施せず、commit/master反映/pushも行っていない。調査記録は手元に保持しpushを保留する。

### 8. 同日の追加調査: 重い機能をPCへ移す案

担当: Codex。所有者の「その機能をローカルPCに移したりはできないのかな」を受け、既存PCの中継・認証・画像・CSV・SSRの経路を追加で読み取った。実装・PC起動停止・公開設定変更は行わない。

**移設は可能。PCで計算する案は、Workersでnative Sharpを置き換える案より現行Node処理を保持しやすい。** すでにPCはDB、記録/大会/期限切れの定期処理、予備同期を担い、Node・R2接続・Tunnelがある。今回の追加対象はまだVercelに残る処理である。

| 処理 | PCへ移す内容 | 無料化への効果と範囲 |
| --- | --- | --- |
| アバター等の署名URL | 本人確認、R2 HEAD、署名生成をPC APIへ | 実測で優先度が高い。画像本体は引き続き非公開R2から配信し、PCで画像bytesを中継しない |
| 画像upload・加工 | Sharpのresize/回転/WebP化とR2保存をPCへ | native Node処理を保持できる。今回のCPU上位はuploadではなく画像閲覧のURL発行であり、加工移設だけで主負荷が消えるとは扱わない |
| シート見出し | CSVの取得・見出しparseをPCへ | 実現可能。移設前に不要な記録本文の解析を除く。閲覧者別の設定/signatureと保存前の列照合を保持 |
| ホーム/タイムラインSSR | NextのHTML/RSC生成をPCで実行 | 大きなCPU移設候補。データ取得をPC APIへ移すだけでは、VercelのReact描画は残る |

通信経路には二段階ある。

1. **最小改修: ブラウザ → Vercel API → PC**。既存Vercel APIを入口にしてPCへ計算を渡す。Vercel CPUを減らせる余地はあるが、本人確認・中継の処理、Function invocation、応答転送とPC待ち中のmemoryは残る。VercelのCPU課金は外部I/Oの待ち時間を除くため、ネットワーク待ちをPCへ移すだけでCPUが大きく減るとは判断しない。[Fluidの計測定義](https://vercel.com/docs/functions/usage-and-pricing)
2. **回数も減らす: ブラウザ → Cloudflareの専用中継 → PC**。通常時はVercel APIを呼ばずにPCから署名URLや見出しを得る。ブラウザRESTで既に採用している考え方をcomputeへ広げる。PC停止時だけ既存Vercel処理へ戻す読み取りfallbackが候補。無料枠を目指すならこの経路の方が削減対象が広い。

現在のCloudflare relayは `/rest/v1/*` だけ、PC gatewayは `/backend/(auth|rest|storage|functions)/v1` だけを許可している。新しい画像/解析APIを置くだけでは通らず、明示的なcompute経路が必要。R2とbridgeの秘密鍵はPC/中継側に保ち、ブラウザへ渡さない。

画像は現在 `<img src="/api/avatar/image">` でVercel originのcookieを使う。別originのPC中継へsrcだけ変えても同じcookieは届かない。クラウドSupabaseの部員Bearerで複数画像の署名URLをまとめてfetchし、返ったR2 URLをimgへ渡す案などを検証する。現在のrelayのJWT decodeは境界filterで、本人の署名検証は後段Supabaseが担う。新compute APIではPC側も署名・期限を検証して本人IDを得る。decodeしたsubだけで署名発行やnote閲覧を許可しない。ノート画像の権限もアバターと別に確認する。

現在の予備切替はDB用であり、PCへ新設した署名・加工・解析APIには自動適用されない。読み取りはPC不在時にVercelの既存実装へ戻す案を検証する。保存/uploadはPCへ届いて保存済みの可能性があるため、通信失敗を理由にVercelへ無条件再送しない。今回の処理移設でもjob journal、R2/DBの部分保存復旧、PC復帰時の書戻しを保持する。

既発行の画像URLは現在7日有効なので、PC停止直後に取得済み画像まで必ず消えるわけではない。初回表示・期限切れ・画像差替えは新たなURL発行が必要で、fallback対象として確認する。PC不在の判定にも現在の約3分の有効期間がある。

アバター・CSVだけを移してCPU約76%削減へ届くかは未測定。部分移設後に請求CPU/回数/転送を測り、Hobby適合を判定する。通常はPCでNext全体を動かし、Cloudflare Workerを公開入口にして、PC停止時だけVercel Hobbyの予備へ中継する案も技術的候補になる。この場合はWorkersでNextを実行せず軽い中継を行う。ただしHobby利用条件、Workerの全アプリ分の回数/CPU、停止中のVercel使用量は別途確認する。

Next全体の移設では、公開originのHost/Origin/Cookie/Set-CookieとRSCストリームを正しく中継し、同一Git SHAだけでなくbuild成果物・静的chunk・Action ID・暗号鍵等も両側で整合させる。停止中の保存の無条件再送は禁止し、PWA・通知も確認する。既存PC gatewayはアプリHTTPの公開機能ではない。PC Jobsのloopback Nextもjob専用の環境・認証なので、そのまま一般部員へ公開しない。現在のNext16ローカルself-hosting/data-securityガイドとも照合した。[Next自己ホスト](https://nextjs.org/docs/app/guides/self-hosting)

APIだけの部分移設なら画面のVercel originを残せる。一方、Next全体をWorkerで切り替える入口には新しい固定originまたは所有ドメインが必要で、`tuat-tf.vercel.app` 自体をWorkerへ付け替えることはできない。PC/Vercelの切替は別URLへredirectせずWorker内で中継し、両側でクラウドSupabaseと `sb-tuat-auth` を使う。OAuth callbackの公開origin維持はVercel側のHost処理を含め個別試験が必要。OAuth code交換はGETでも副作用があるため、timeout後の自動fallback再試行は純粋な読み取りに限定する。画面だけVercelへ戻してもPC DBが停止したままでは動かないので、既存クラウドDB予備の切替・書戻しも併用する。

`pc-vercel-proxy.ts` は `PC_TRIAL_VERCEL` 条件の本人限定試験で、汎用の本番compute公開機能とは扱わない。既存の休止中新アプリや古い試験を再開せず、現行アプリの処理から切り分ける。

追加調査の成果はこの文書への追記と索引文言のみ。実コードの確認に基づく設計候補であり、PC処理移設・削減率・本番動作を検証済みとは報告しない。本番変更・commit・pushはなく、文書は手元に保持する。

その後の所有者指示「PCに移せる処理はPC統一でいい」によるローカル実装、合成build、受入検証と未適用の公開案は [PC統一記録](PC-COMPUTE-UNIFICATION-2026-10-08.md) を参照。本番・料金設定の変更はまだない。

さらに「今のURLを維持」の希望を受け、Vercel CDN external rewriteで `tuat-tf.vercel.app` を保持する準備へ変更した。Hobbyでも対応するが、CDN要求・転送と予備処理の無料枠適合は別途確認する。300秒のシート同期は入口の120秒制限に合わせ初期対象から除外する。新URL移行案より現在の [PC統一記録](PC-COMPUTE-UNIFICATION-2026-10-08.md) を優先する。本番変更・pushなし。
