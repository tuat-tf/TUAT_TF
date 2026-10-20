# コード全体の統一性・保守性・不要コード調査（2026-10-20）

## 開始・範囲

通信量とCloudflare上限の対策に先行し、所有者の依頼によりコード全体の不統一、将来開発の障害、無駄に残るコードを調査する。実装・削除・公開は行わない。

fetch後の基準はorigin/master `39c525d6cf9f5881ac648c8592bb4d42cec65294`。既存の未コミット変更を保全し、同SHAの `D:/TUAT_TF/.worktrees/pc-folders-20261008` を読み取りに使う。前回の通信量調査と別の観点を担当分離して確認する。本人用統合版 `2650b98` 等の未公開修正を照合し、実装済みの改善を作り直す提案を避ける。

対象はsrc全体の依存/参照と主要実行経路、UI・保存・取得・型/DBの契約、ops/scripts/gasの入口、検証設定と依存ライブラリ。未使用判定はNextの規約入口、動的import、CSS/public、DB RPC/trigger、GAS、外部運用を考慮する。全ファイルの全文精読や実運用の網羅試験と同一視しない。migration・復旧資材・GAS旧合体版・node_modules・既存作業コピーは削除しない。

受入条件は、根拠・現在の影響・優先順位・未公開修正の有無・削除確度/要確認を区別した一覧を作ること。コード/DB/権限/環境/本番サービス/秘密を変更しない。作業記録と索引のみローカルに保存する。

## 調査方法と結論

現行srcの追跡ファイル684件に対し、TS/TSX/JS系677ファイルのimport/export/動的import/requireを解析した。テスト・型宣言等を除く498ファイルについてNext規約入口125件からの参照を辿り、候補は全体検索・内部使用・テスト・ops/scriptsの読込みと照合した。独立3担当がUI、サーバー/DB、ops/GASを調査し、主担当が依存・不要コード・検証設定・未公開差分を統合した。機械検出は候補抽出に限り、件数を不要コード数とは扱わない。

基礎の `app/components/lib/queries/supabase` 境界は成立しており、全面的な作り直しを裏付ける結果ではない。今後の障害になりやすいのは、保存/取得の契約が揃っていないこと、未公開改善と本番の乖離、現構成を網羅しない検証入口、二系統の大会・権限・運用である。不要コードはファイル丸ごとよりも、現役ファイル内の旧関数・旧分岐・未使用依存に多い。

コード参照の行番号は `39c525d`、パスの基点は `D:/TUAT_TF/.worktrees/pc-folders-20261008`。本人用版はcommit `2650b98` と比較し、cleanup専用commit `ae2e772` とrootの既存未コミット修正も照合した。実機の保存事故、実DBの件数・ready状態、GAS外部triggerの有無までは確認していない。

## 開発前に解決・明文化したいこと

### 1. 未公開改善版をそのまま現在へ採用できない（優先: 高）

10/13の本人用 `2650b98` には再利用すべき修正・試験があるが、基点が古い。現在との差分には、退役済みGoogle OAuth/Sheets返信を戻すもの、ローカル画像・Push・予備書込み保護・大会division/relay等を失うものも含む。これらは本人用版で削除する意図を示すのではなく、後から公開版に加わった変更を含まないためである。

現行を正本として、既存の改善commitから目的別に載せ直す必要がある。検証版一式の上書きはしない。「既存修正あり」は現行へそのまま適用可能という意味ではない。公開保留・実機未確認を維持する。

| 再利用する既存改善 | 現状 |
| --- | --- |
| 取得エラー、全件ページ取得、CSV取込復旧、選択肢loading/error | 本人用 `2650b98` に実装/試験あり、公開版で残存 |
| 不要関数・直接依存3個の除去 | `ae2e772` に整理済み、現行master未反映 |
| 旧ガラス分岐整理 | 本人用に実装あり、現行のその後のUI修正と照合が必要 |
| ESLint/tsconfigの作業コピー・private状態の除外 | rootに既存未コミット差分あり、新規に重複作成しない |

### 2. 取得失敗が「空」「不存在」「例外」に分かれる（優先: 高）

`src/lib/queries/notes.ts:38,168` はerrorを確認せずnullへ変え、`src/app/(app)/notes/[id]/page.tsx:36` 等は404を返す。`queries/notices.ts:12,75` も空/0へ変える一方、`queries/records.ts:43` はthrowする。新しい画面やcache実装が障害を正常な空状態として覚えやすい。

本人用には修正と `queries/fetch-failures.test.ts` / `query-errors.test.ts` がある。正常0件・閲覧不可・不存在と取得失敗を分け、エラー境界と再取得の契約を揃える。確認済み範囲から選択的に移植する。

### 3. 保存失敗・部分保存・結果不明の扱いが異なる（優先: 高）

`src/components/post/ScheduleForm.tsx:183` の新規作成はエラー後に再試行を案内し、`MenuForm.tsx:261,277` と `features/NoticeReactions.tsx:59` も結果不明専用の照合がない。旧OBは `src/app/(app)/ob-entries/actions.ts:51,57` のmetadata変更だけuncertainを持ち、`:243` のguest作成では持たない。一方、汎用大会の `competitions/meet-actions.ts:43` と `CompetitionMeetWorkspace.tsx:39` はrequestId・照合を持つ。

同じ「保存」を他画面から流用しても再送の可否が違い、通信応答を失ったときに重複作成や表示の巻戻しを招き得る。本人用にも残る課題。全画面用の新しい共通層を先に作るのではなく、操作別に確定成功・確定拒否・競合・0件・結果不明と確認方法を明示する。応答だけを失う試験で、入力保持・照合・無条件再送なしを確認する。

CSV取込は別途、`features/MenuSheetImportManager.tsx:82,107,148` と `features/schedule-sheets/useScheduleSheetImport.ts` にcatch/finally・確定済み行・不明行の扱いの差がある。こちらは本人用に修正済みなので再作成せず移植を検討する。

### 4. FormModalとPersonPickerの利用契約が揃わない（優先: 高）

- `MenuForm.tsx:491` の `SheetMenuEditModal` はFormDraftGuard未登録で、保存中も入力できる。`ui/form-modal.tsx:60` は登録なしならそのまま閉じる。共通モーダルを使うことと未保存保護が付くことが同義ではない。同ファイルの通常編集と本人用でも差がある。
- `features/RoleManager.tsx:100` は全membersの楽観snapshotを持ち、失敗すると配列全体へ戻す。`PersonPicker.tsx:119` は非同期保存を待たず閉じ、`RoleManager.tsx:125` に保存中ガードがない。Aの保存待ちにBを保存し、B成功後にA失敗なら成功したBの表示まで戻し得る。初期propsから作ったstateはrefresh後の再同期も定義されていない。

本人用でも残る。入力保護登録と保存中の閉じる/編集、DB保存を伴うpickerの完了契約を明示する。RoleManagerは対象ロールだけの巻戻しと正本への同期を検討する。応答順序入替えで他の成功を戻さないことを確認する。永続オフライン下書きは追加しない。

### 5. 全件取得と上限付き取得の契約が不明確（優先: 高）

`src/lib/fetch-all-pages.ts` は存在し、大会別結果では利用される。一方 `queries/rankings.ts:39`、`queries/monthly-results.ts:15`、`queries/records.ts:68`、`queries/competitions.ts:100` は単回取得を全件集計として使う。DB側の返却上限を超えると結果が欠け得る。実件数が上限を超えているかは未確認。

本人用には安定順序付き全ページ取得と試験がある。「全件集計」「ページ一覧」「直近N件」を関数の契約として区別する。通信量を減らす際はDB集計へ寄せる等で正確性を保ち、取得上限を付けて必要な履歴を失わない。

### 6. 選択肢の取得中・失敗・本当に空を区別できない（優先: 中）

`src/components/post/use-competition-catalog.ts:10,19,39` は初期空配列と失敗を同じ値で返す。利用フォームは読込状態・再試行を表示できず、未登録として扱いやすい。本人用にはhasData/isError/isLoading/retryの追加がある。利用側とセットで移植し、既存取得済み候補は障害時も保持する。

### 7. ロール名と権限フラグをTS/SQLで手同期している（優先: 中）

`src/lib/permissions.ts:24` のフラグに加え、`:45` の「管理者」、`ob-meet.ts:21` の「OB戦2026」、`menu-permissions.ts:6` のブロック長名が認可の根拠になる。DB側にも `20260929000000_admin_comment_delete.sql`、`20260928010000_ob_entry_access_history.sql`、`20261001010000_block_menu_permissions.sql` で名称が入る。

表示名変更が認可変更にもなるため、UIだけの修正でRLSと食い違い得る。現在の仕様であり、直ちに権限バグとは断定しない。まず名称依存とTS/DBの一致試験を明示する。将来の固定ID/明示権限への移行は別設計とし、複数ロールOR・preview抑止・OB担当範囲を広げない。

### 8. 大会の操作型・JSON境界が広すぎる（優先: 中）

`src/lib/competition-meet.ts:12` のMeetCommandは全action共通のoptional項目群で、`{ action: "appearance.add" }` だけでも型上の必須項目を満たす。`src/types/database.ts:2207` のRPC境界は広いJson、`queries/competition-meet.ts:11` は外形確認後にドメイン型へcastする。

新actionやSQL列変更の漏れをビルドで捕まえにくい。操作別の判別unionと大会ドメイン内の境界検証・契約試験へ揃える候補。現在のDB側検証、relay検証、requestId、revisionは維持する。旧検証版のrelay追加前の型で上書きしない。

### 9. 旧OBと汎用大会が両方現役である（優先: 中）

`src/app/(app)/competitions/[id]/program/page.tsx:45` と `home/page.tsx:92` が汎用snapshotの有無で旧OBへ分岐する。`20261012010000_competition_participants_appearances.sql:196` のready条件と旧系書込み拒否も関係する。表示・結果・担当・履歴を変更するたび二系統への適用を判断する必要がある。

本人用も移行完了版ではない。実DBのready・移行履歴を確認する別作業で撤去条件を決めるまで、旧OB一式を不要として削除しない。入口でどのbackendを使うかと共通ルールの変更範囲を明文化する。

### 10. DB関数の現在形が複数migrationの書換に分散する（優先: 中）

`20261012180000_local_backup_write_guard.sql:79` は既存Push関数へガードを注入し、`20261013020100_meet_division_mirror.sql:36` は本文の文字列置換と旧関数のrename/wrapperを使う。存在・置換回数・再適用の検査は実装されているが、最初のCREATE FUNCTIONだけを読んで再定義すると後続保護を失い得る。

現在の不具合と断定しない。関数変更時に最終定義とwrapperを照合する対象一覧・契約試験を用意し、新しいmigrationで検証する。既存migrationの書換や単純統合はしない。

### 11. 標準の検証入口が現行PC構成を含み切らない（優先: 高）

`vitest.config.mts:7` はsrcのtest.tsだけ。ops/scriptsのtest.mjs44本・test.py9本の計53本のうち、npmの全test scriptに明示登録されたものは31本で、22本が含まれない。現PC中核のlocal-minimal backup/runtime/periodic/offsite/retention/bootstrap、Cloudflare入口の試験も含む。別にPowerShell試験1本がある。このcommitにCI用 `.github` はない。

テストが無い・過去に未実行という意味ではなく、通常の合格報告の範囲がコードの重要度に一致していない。Node合成、Python/Linux、PowerShell、実DB/実経路を分けて再現可能な入口を用意する。本番へ触る試験を通常テストに混ぜない。

また現行 `eslint.config.mjs` では `.worktrees/**` と `.contingency/**` が除外されず、ESLint APIで両テストpathのignored=falseを確認した。全体lintで作業コピー/検証資材が混ざり得る。rootには既存の除外差分があるので、対象を保全して取り込む。

### 12. 調査用コピーの依存と実行環境が再現可能な状態に揃っていない（優先: 高）

Node24.19.0を明示してmasterコピーの `check:environment` を実行したところ、`node_modules/web-push/package.json` 不在で失敗した。tscは成功しており、型検査だけではruntime依存の不足を検出できない。これは調査用作業コピーの状態であり、本番で依存が欠落しているという指摘ではない。修復・依存インストールは行っていない。

通常のPATHには別Nodeもあり、開発用checkは22.12以上を許容する一方、`ops/local-minimal/runtime.py` は運用Node24.19.0を固定する。診断CLIは未宣言のnpx tsxを案内するものもある。開発環境と固定releaseの適合条件、CLIの起動方法を分けて明示する。共有node_modulesや本番pinを一括変更しない。

### 13. 運用READMEと現行の依存が一致していない（優先: 中）

`ops/pc-host/README.md:8,60`、`ops/pc-jobs/README.md:3,15`、`ops/pc-host/cloudflare/README.md:3` は候補/未切替/クラウドAuth等の説明が残る。現在コードのJobsはPushを含む4種、最新引継ぎはPC内Auth/画像である。日付ログの古い状態と入口READMEの現在説明を区別する必要がある。

現行依存は `local-minimal/runtime.py` → `pc-host/run.mjs` / `pc-jobs/run.mjs`、さらに `pc-host/run.mjs` → `pc-backup/run.mjs` → `pc-backup/adapters.mjs` → `laptop/backup-backend.mjs`。旧名のディレクトリにも現役の復元関数がある。入口を現行・復旧・移行試験に分類し、停止済みownerと共有ライブラリをファイル単位で分ける。フォルダ名だけで削除しない。

## 不要コードの候補

### アプリ内で利用が見つからず、整理しやすいもの

以下は現行コードの参照検索・AST解析・実行入口照合に基づく。削除自体は未実施。tree-shaking等のため、残存行数がそのまま通信量やruntime負荷になるとは限らない。

| 対象 | 根拠・扱い | 既存整理 |
| --- | --- | --- |
| `features/NoteEditor.tsx:24` のNoteEditorButton | 呼出しなし。現役NoteEditor本体を残す | ae2e772にあり |
| `post/MenuForm.tsx:78` のMenuComposerForm | 呼出しなし。編集modalと共通編集本体は現役 | ae2e772にあり |
| `post/MenuForm.tsx:53` のMenuForm | 現行src/ops/scriptsから呼出しなし。旧追加ボタンのwrapper。配下の作成専用部品は別途内部参照を確認して整理する | 旧cleanupでは残るため追加候補 |
| `ui/card.tsx:25` のCardSection | 呼出しなし。Card本体は現役 | ae2e772にあり |
| `queries/rankings.ts:7` getWeeklyRanking、`queries/schedules.ts:12,43` getSchedulesOn/getUpcomingSchedules | 現行取得経路から呼出しなし。月ランキング/出欠付き取得を残す | ae2e772にあり |
| `sheet-sync/reconcile.ts:27` reconcileOnSwitchと再export | 呼出しなし。旧 `/api/sheets/reconcile` は認証後409を返すため本体を使わない。409入口は互換応答として残す | ae2e772にあり |
| `client/query-persistence.ts:8` queryPersister | 呼出しなし。`:17` clearPersistedQueriesはProfileEditFormから使用するため残す | ae2e772にあり |
| 直接依存 `@radix-ui/react-avatar` / `@radix-ui/react-tabs` / `@tanstack/react-query-persist-client` | 前2個は参照なし、後者は未使用queryPersisterの型importのみ。idb-keyvalはcache消去で使うため残す | manifest/lock整理がae2e772にあり |
| `blog-feed.ts:121` getBlogFeedと専用RSS取得経路 | 本番から呼出しなし。現在はブログ一覧/記事HTML取得を使う。XMLパーサはテストのみ。現役HTML解析・URL検証は残す | 追加候補 |
| `xlsx-writer.ts:11` buildXlsx・ZIP/XML writer、`:9` MIME定数 | 実行関数はテスト以外から呼出しなし。手動Excel入口の撤去記録と一致。ただしXlsxCell/XlsxSheet型は3モジュールが使用するためファイル丸ごと削除しない | 追加候補 |
| `competition-meet.ts:32` newAppearancePerformance、`supabase/auth.ts:105` getRealCurrentProfile、`app.ts:5` APP_TAGLINE | 定義以外の使用なし。前2個は未使用wrapper/alias。参照が追加されていないか削除直前に再確認する | 小さい追加候補 |

### 条件付きで退役を検討するもの

- 常にtrueの `useSystemGlass` に対する旧分岐。28の非テストファイルがhookを参照し、`ui/action-menu.tsx:100`、`common/ShareButton.tsx:93`、`ui/image-lightbox.tsx:24`、`layout/FAB.tsx:345` 等に旧方式が残る。本人用に整理済みだが、その後の公開UI差分を保って移植する。`cards/CommentSection.test.ts:17` はfalseへmockしており、現行UIと異なる分岐の試験になっている。これだけで全コメント試験が無効とは扱わない。
- `ob-entries/actions.ts:104` のsaveDutyは現行UIからの参照がなくテストのみ。旧Server Actionや旧画面/移行用途を確認してから撤去する。現役saveDutyRoles/saveDutyPeople/saveDutyRoleは残す。`ob-duty.ts:70` nextCommitmentもテストのみで、現役のadjacentCommitmentsと区別する。
- `gas/sync-clasp/Code.js:68` で公開writeReply/deleteReplyを拒否しているが、`:431` 以降の旧返信本体と `gas-reply.test.mjs:43` 以降の直接呼出し試験は残る。GAS trigger/Execution API/復旧手順を確認後、現行配備から外す候補。拒否応答、過去コメント、queue/tombstone、旧版の退避は維持する。GAS旧合体版は対象外。
- `public/vendor/liquid-glass/simple-liquid-glass.js`（68,790 bytes）は現行srcからの読込みが見つからず、参照は `ops/glass/build-vendor.mjs` / `verify-images.cjs` 等の旧生成/検証側。公開部品のbackdropはブラウザの直接透過を使う。旧生成手順の保存先・必要性を決め、ライセンスと履歴を保持したうえで公開資産から外す候補。通常画面でこの容量を毎回転送しているとは主張しない。
- `scripts/sync-middle-long-menu-db.mjs` は使用案内/現役呼出しを発見できない一時CLI。`.env.local`自動読込、独自CSV解析、IDだけの更新、失敗時の無条件書戻し、prune削除が現行運用契約と揃わない。実行はしていない。用途終了なら退役表示/保管、継続なら正本・snapshot/dryRun・競合/件数の契約へ揃える。`dryrun-sync.ts`、`dryrun-pb-normalize.ts`、旧R2移行CLIも運用用途を確認する。

### 誤って削除してはいけないもの

- アプリ入口から到達しない唯一のTSモジュールとして `src/lib/pb-normalize.ts` が抽出されたが、`ops/laptop/plan-pb-normalization.mjs:14` が名前から読込・コンパイルするため現役の外部利用がある。削除候補から除外した。
- `mountGlass` は `BottomNav.tsx:85` の動的import、validDutyRolesEdit/validDutyRoleEdit/validDutyRoleDeleteはOB actions内の動的importで使用する。単純なexport参照数の検出では漏れるため保持する。
- Nextのroute/page/layout、公開API、GAS doPost/trigger、Cloudflare Worker、DB RPC/triggerは通常importがなくても外部入口である。410/409/503を返す退役入口も旧クライアントの保護役がある。
- `supabase/functions/send-web-push` は旧webhook・配置から参照され、local Web Push migrationに旧mode保管/復帰の契約がある。通常のapp importだけで削除しない。
- 215本のmigration、GAS旧合体版、復旧用資材、ライセンス、失敗journal、mirror-state、共有node_modules、既存worktree・未コミット成果は保持する。

## 改善の順序

1. 現行masterを基準にする作業場所・依存・標準検証入口を揃え、本人用から何を取り込むか目的別に明確化する。既存rootの除外差分を保全する。
2. 取得失敗、全件集計、CSV取込など既に実装済みの修正を個別に移植・検証する。未公開版全体を採用しない。
3. 未使用関数/依存/旧UIの整理を独立した差分にする。データ・権限・外部入口を変えない整理と、保存契約を変える修正を分ける。
4. 未解消の保存結果不明・入力保護・ロール変更の競合を、実操作と障害注入で揃える。大会の操作型・旧系撤去条件、TS/SQL権限一致も順に明確化する。
5. その基盤で通信量・Cloudflare回数を削減する。全件データの欠落や保存の取りこぼしによって回数だけ減らす変更はしない。

## 終了・検証・未確認

- 解析対象は最新master `39c525d`。前の調査で公開 `/api/version` の同SHAを確認済み。この追加調査では公開設定やサービスへ変更を加えていない。
- Node24.19.0で `tsc --noEmit --incremental false` は成功。環境確認は調査用コピーのweb-push未導入で失敗。依存の自動修復はしていない。
- 参照解析と全体検索、対象commit比較、ESLint APIの除外判定を実施。動的import/運用による機械検出の誤判定は候補から除いた。調査補助script/生の解析結果は `.contingency/codebase-audit-20261020/` にローカル保存した。生の候補一覧は削除許可リストではない。
- コード修正がなく、環境検査にも不足があるため全Vitest・ops試験・buildを再実行していない。過去の試験成功を今回の成功として流用しない。実機の応答喪失、DB/RLS、現行GAS外部入口、復旧経路の実試験は未実施。
- 変更は本記録・索引・読み取り調査用の補助script/結果のみ。製品コード、DB、環境、依存、本番、既存作業コピーは変更なし。削除・commit・push・deployなし。
