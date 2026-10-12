# 未使用ファイル・コードの整理（2026-10-13）

## 開始

- 担当: Codex。所有者の「余計なファイルやコードを調査して削除する」に対応。
- 基準: fetch済みorigin/master `292b3ca`。元checkoutには多数の既存変更があり、専用worktreeとローカル作業ブランチへ分離。
- 調査: Next.jsの入口規約を確認し、616ソースファイルのimport/export/dynamic import/requireを解析。名前の全体検索、内部利用、テスト、運用スクリプトも照合する。静的調査であり、実機の不要機能の再現とは区別する。
- 受入条件: 現役のフォルダ作成・メニュー追加・予定/ランキング表示・記録設定・シート同期の入口と挙動を維持する。到達不能な旧実装と未使用の依存だけを削除し、環境確認・型検査・対象eslint・全Vitestを通す。
- 保持: データ・権限・認証・本番設定、GAS旧合体版、履歴/ライセンス、PB正規化など運用から読み込むコード、元checkoutの既存変更。本番反映は全体改善の公開保留を維持する。
- 復旧: この作業のdiff/commitだけで戻せる範囲とする。共有node_modulesの削除や再インストールはしない。

## 調査と判断

- ファイルがアプリ入口から到達しないという理由だけでは削除しない。`src/lib/pb-normalize.ts`は`ops/laptop/plan-pb-normalization.mjs`が読み込んでおり保持。
- `reconcileOnSwitch`は全体検索で呼び出しがない。旧`/api/sheets/reconcile`は認証後409を返し、現在の期間別設定へ案内するため、その互換入口は保持し、旧同期本体と再exportだけを撤去する。
- `NoteEditorButton`、`MenuComposerForm`、`CardSection`、`getWeeklyRanking`、`getSchedulesOn`、`getUpcomingSchedules`は他ファイル・テスト・運用からの呼び出しがない。現役の編集本体・カードからの追加・月間ランキング・出欠込み予定取得を保持。
- `queryPersister`は呼び出しがない。プロフィール変更時の`clearPersistedQueries`は現在も使用されるため保持。未使用のpersist-client依存とRadix avatar/tabsをmanifestとlockfileから撤去する。
- `useSystemGlass`は常にtrue。月間予定編集・結果管理・記録フォーム設定の旧表示分岐を取り除き、現在選ばれている要素・文言・イベント・属性をそのまま残す。
- Python生成物は追跡不要。`__pycache__`を全階層で無視し、既存の重複ignore記述を整理する。既存生成物・運用状態は一括削除しない。

## 終了

- 削除: 旧シート切替同期本体1ファイル、未使用の入口/取得/永続化関数7個、3画面の到達不能な旧UI分岐。直接依存3個と、それだけに必要だった間接依存3個をlockfileから除去。コード・依存・ignore・索引の15既存ファイルで13行追加/461行削除（この記録の新規追加は別）。
- 検証: Node.js 24.19.0で`check:environment`成功（直接依存32件が一致）、Nextの`typegen`成功、`tsc --noEmit`成功、変更した10ソースのeslint成功、全Vitest 143ファイル/1,246テスト成功、`git diff --check`成功。削除した名前についてsrc/ops/scripts/gas内の残存参照なし。
- 最初の環境確認で標準PATHのNode.js 18.17.0と本体checkoutの古い依存が不一致だった。専用worktreeのjunctionだけを既存の一致する検証用依存へ切替。本体node_modules・本番プロセス・DB・環境変数は変更しなかった。
- lockfile更新ではnpmのバージョン差による無関係なoptional/peerメタデータ差とTailwind WASMの追加エントリを除外し、未使用の6パッケージ削除に絞った。残存パッケージのバージョン・整合性情報を保持。
- 未確認: 実機での一連の操作、本番DB/GASとの接続、ブラウザの操作確認。今回は呼び出しのないコードと常にtrueの表示分岐の静的整理であり、テスト件数を実機確認の代用にしない。VitestのOB編集試験から既存のread-onlyフィールド警告が出たが失敗なし。対象外のコード・運用資料・過去worktreeを一括削除しない。
- 保管: `codex/unused-code-cleanup-20261013`でローカルcommitにまとめる。元checkoutの既存変更を保持。全体改善の公開保留に従い、master統合・build・push・deployは行わず、本番反映なし。
