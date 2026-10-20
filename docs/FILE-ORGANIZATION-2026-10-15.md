# ファイルと作業コピーの整理（2026-10-15）

## 開始・目的

- 担当: Codex。所有者の「ファイルの整理をしてください」に基づく。前回の[構造確認](STRUCTURE-REVIEW-2026-10-13.md)から、配置と検証対象の混在を解消する。
- 基準: fetch後の `origin/master` = `35b0a92`。元checkoutは `3dc1714` で27コミット遅れ、追跡・未追跡の既存変更を保持する。設定ファイルは最新版との差を照合して対象だけ変更する。
- 受入: 画像資料を専用場所へ移して参照と原本を保持する。Git・ESLint・型検査から作業コピーと内部退避を適切に除外する。古い作業コピーは統合・未保存変更・ignored資産・稼働参照を照合し、安全なものだけ整理する。現行版・本人用検証版・運用候補の場所を案内する。
- 保護: 既存の未コミット/未追跡成果、公開保留の改善、依存node_modules、WSL/DB、認証、環境変数、mirror-state、Jobs journal、稼働中サービス、管理接続を維持。旧新大会処理の統合やPC移行は今回再開しない。
- 復旧: 作業コピーのbranchは削除しない。撤去対象とHEADを非公開の整理記録へ保存する。画像は内容hashを照合する。文書・設定の差分は局所的に保持する。
- 本番: ローカル整理。build・push・deploy・DB操作は行わない。

## 実施した整理

- `docs`直下の画像6件を `docs/assets/2026-10-13/` へ原本移動。`MEET-RESULTS-DUTIES-2026-10-13.md`と`OB-GENDER-RESULTS-2026-10-13.md`の計6参照だけ更新した。全6件で移動前後のSHA256一致、旧パス不在、参照先の実在を確認。両文書の未公開状態・内容・画像内容は保持。
- `.gitignore`の内部退避を `**/.contingency/` へ揃え、全Pythonキャッシュを除外。重複した `.vercel` の1行を整理した。`ops/pc-rest-relay/.contingency/`と`ops/__pycache__/`が誤ってGit追加対象へ出る状態を解消した。実ファイルは削除していない。
- ESLintから `.worktrees/`・全階層の `.contingency/`・`.r2-migration/`を除外。TypeScriptも全階層の `.contingency/`を明示除外した。アプリコードは従来どおり対象に含める。
- READMEへファイル配置と最新版の探し方を追加。docs索引へ本記録を追加。既存の記録・未追跡資料は保持。

## 現在の作業場所

| 場所 | 用途・状態 |
| --- | --- |
| `D:/TUAT_TF` | 既存の未公開差分・ローカル文書・本番運用の依存を保持する元checkout。HEAD `3dc1714` |
| `.worktrees/pc-folders-20261008` | `master`。確認時 `origin/master`と同じ`35b0a92`。既存の大会集合時刻の文書差分は保持 |
| `.worktrees/integrated-review-20261013` | 本人用の未公開改善。公開版と混同せず、最新状態は[統合記録](INTEGRATED-IMPROVEMENTS-2026-10-13.md)を読む |
| `.worktrees/pc-precutover-20261011`・`.contingency/pc-unified-worktree` | PC集約候補。別担当の作業・運用依存を保持 |
| `.worktrees/sheet-visibility-admin-20261015` | プロセスからの参照を確認した現在の作業コピー。移動対象外 |

元checkoutを自動pull・stash・resetして既存の未公開差分と混ぜることはせず、最新版と一致する整理対象設定だけ局所変更した。

## 作業コピーの選定・初回保留

- 登録worktreeは79、そのうち `.worktrees`直下70。古いmaster先祖の48コピーを調べ、34は追跡・未追跡cleanだったが、全48にnode_modulesがあり、単純な一括削除は適さない。
- 未公開・PC/認証/本番・dirty・入れ子の状態・ビルド成果を除き、完了済みcleanの21コピーを保管候補に選定した。HEAD・branch・ignored一覧・依存の最終参照先を非公開metadataへ保存した。
- 登録worktreeだけの参照確認では足りず、古いbuildから32コピーへのjunction43本も検出。追加のmetadata確認は15,174ディレクトリ、エラー0、キュー残り0。ただしDB・backup・依存実体などの除外領域や任意の深い参照の不存在まで保証しない。
- 候補21コピーは古いbuildから28本の依存リンクで参照されていた。共有依存の実体を保持し、28本を同じ最終realpathへ直接つなぎ直した後、コピーを `.contingency/worktrees-archive/2026-10-15/`へ移動する計画を作成。元リンク・branchを残し、失敗時に元パスへ戻す手順を含むdry-runは成功した。
- **自動承認審査が、この21コピーの移動と28リンクの変更を拒否した。** 理由は、未確認の深い・多段の参照があり、稼働依存への影響を十分に否定できず、一般的な整理依頼の範囲では広範な操作の安全性が不足するというもの。
- 初回に拒否されたコマンドは起動されず、その時点では作業コピー移動・junction変更・branch削除は0。原本・依存・登録を現位置のまま保持し、所有者へ具体的な対象とリスクを示して承認を依頼した。
- 非公開の対象一覧・dry-run・原本の参照先は `.contingency/file-organization-20261015/` に保存。この領域はGit・lint・型検査から除外済みで、公開リポジトリへ追加しない。

## 所有者承認後の実施・終了

- 所有者が「21コピーの移動と28リンクの変更を承認する」と明示回答。再確認時の最新 `origin/master` は `5840758`。既存の21コピー/28リンクの計画を再計算して全項目一致を確認し、承認対象・SHA256を保存した。
- 独立レビューで、再計算した計画が承認対象から変わらないガードを追加。applyは21/28件数、全移動/リンク項目、承認SHA256、stateの実パス一致を必須とした。対象追加や別方式への変更は行っていない。
- 承認済み21コピーを `.contingency/worktrees-archive/2026-10-15/` へ `git worktree move`で保管した。`.worktrees`直下の登録は70→49。全登録79とbranchは保持し、削除による削減とは扱わない。
- 古いbuildからの28 junctionは、同じ `.contingency/pc-jobs-526cd18/node_modules` 実体へ直接接続。依存実体の削除・再導入はなく、変更前のjunction原物28件を `original-junctions/`へrename退避した。対象外15本の参照は変更なし。
- 親と独立担当が21/21の移動先・worktree登録・HEAD/branch一致・tracked/untracked clean・旧パス不在・依存終端の維持を確認。28/28の現在realpath一致と退避原物のtarget一致も確認した。
- 初回の稼働確認ラッパーには `Split-Path -LiteralPath ... -Parent` の引数誤りがあり、リンク側28対象の取り出しに失敗したが、その後の処理が継続した。確認済み扱いにせず、`Path.GetDirectoryName`とエラー時停止へ修正して全49対象を事後確認し、該当するプロセス/タスク参照0を確認した。TUATタスクの状態は保存した実行前後で同じだった。依存・HEADの実行内検証は成功している。
- サービス停止・DB/環境変数操作・本番コード変更はしていない。実アプリ操作や障害復旧の再試験は対象外で、タスク状態・パス検証を運用全体の保証とは扱わない。

### 保管先・復旧

- 正確な元/保管パス、HEAD、branch、元junction・退避パス・現在の実体は `.contingency/file-organization-20261015/organization-result.json` に保持。`owner-approved-plan.json` と `owner-approval.json` が承認時の対象、`post-verification.json` が完了確認。
- 元の配置へ戻す場合は、まず保管後の追加変更を確認し、結果JSONの各 `destination` を `source` へ `git worktree move`で戻す。その後、28個の現在junctionを別名保全し、各 `backup` の元junctionを `source` へrenameで戻す。順序はコピーの逆移動→元junctionの復元。依存実体は削除しない。
- `original-junctions/`の退避原物は元の絶対パスを保持するため、コピー保管中はそのリンク先が不在になる。現用28本は直接接続済みであり、退避原物を現用と誤認して一括修復・削除しない。

## 検証・本番反映

- 最新masterの既存Node.js 24.19.0・直接依存35件がlock一致。`check:environment`、型検査、全Vitest151ファイル/1,328件成功。
- 更新したESLintで現行source/configが対象、作業コピー・root/nested内部退避が除外となる5条件を実際のAPIで確認。対象configのESLintは警告/エラー0。
- 更新したTypeScript設定を最新版の基準ディレクトリで解析し、648入力に内部退避の混入なしを確認。Gitでも内部退避・Pythonキャッシュ・worktreeの除外を確認した。
- 実機UI・DB・外部連携・障害復旧試験は今回対象外。アプリ本体のsource・データ・サービス・依存実体は変更していない。
- 変更はローカルの配置・共有リンク・設定・案内・本記録のみ。所有者承認後の保管移動と事後確認まで完了。commit・build・push・deployなし。先の型検査/Vitestは整理着手時の最新版`35b0a92`に対する確認で、別作業が追加した`5840758`の再テストとは扱わない。保管処理ではアプリsourceを変更せず、移動後は依存・HEAD・登録の確認を行った。

## 表示不可の報告後の確認（調査中）

- 所有者から「本番環境でエラー」「表示されない」「スマホのやつ」と報告。開いているorigin/画面はまだ特定できていないため、整理が原因とも、復旧済みとも断定しない。
- 外部HTTPで従来Vercel版の `/api/version` は`5840758`・200、PC公開版は`0acc6f7`・200。双方の未認証ログイン画面は200。iPhone相当User-Agentで取得したJS/CSSも13件/14件すべて200。これはログイン後の実ユーザー画面・実機PWA表示の検証ではない。
- 本人用の `tuat-review.track-app.workers.dev` では530 Origin DNS errorを再現。固定Workerが指す旧quick Tunnelが失効し、保存PIDは存在せず、Tunnel終了ログは10/15 06:48:37 JST。独立確認版の起動手順と、本人枠/cookieを保ったまま復旧する前提を確認したが、対象URLの回答前に再公開・本人枠解除は行っていない。
- 別担当の本番移行も継続中。23:06–23:07 JSTの読取では旧cloud DataAPIが無効・旧backend停止、新nativeの画面/Tunnel/Auth/DBは稼働しているが、`0acc6f7`は閲覧専用で最終writer切替は未実行。別担当のDB・サービス・切替には介入していない。
- 整理の原配置復元も独立して事前確認。21保管コピーはclean・HEAD/branch一致・元パス空き、現用28junctionと退避原物28junctionは全て保持され、復元可能。原因未特定のまま別作業へ影響する変更は加えず、追加の移動・復元・再起動は未実行。
- ownerへ確認用固定URLか普段のホーム画面アプリかを照会中。実際の入口/表示を特定し、対応する環境だけを復旧する。
