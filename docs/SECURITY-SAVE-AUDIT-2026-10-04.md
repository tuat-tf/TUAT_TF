# セキュリティ・保存処理の調査と改善（2026-10-04）

担当: Codex。作業開始時の基準は `5b43c9d`。作業先は独立した `app-quality-20261004` worktree。AGENTS・最新の全体監査・PC運用・完了記録を照合してから、認証、API、RLS、画像、保存、結果不明時の復旧を調査した。既存の権限鮮度、メニュー下書き閲覧、GAS、OB当日運用の完了済み修正は作り直していない。

## 調査範囲と受入条件

開始時点の36画面入口・35 API入口、認証/PC中継/R2/GAS/cron/OB/Google連携の主要ヘルパー、SQL履歴中のRLS、重要なクライアント更新を静的に棚卸しした。SQL履歴で抽出した72テーブルにはRLS有効化が存在したが、これを本番DBの現行ポリシー一致の証拠とはしていない。

今回の修正条件は、入力が途中で失われないこと、必要な保存が失敗してから別の行を勝手に作らないこと、権限変更をUIだけで広げないこと、0件更新/削除を成功としないこと、通信結果不明時に無条件再送しないこと。同時編集では古い全行を上書きせず、保存全体が必要な操作は既存RLS下の一取引へまとめる。

## 確認した原因と変更

| 操作 | コード・再現根拠 | 修正と保持条件 |
| --- | --- | --- |
| 外部ブログを表示 | 独立した無害なmarkerで、非標準表記のHTML属性が旧正規表現処理後も残ることを確認 | `blog-feed.ts` は `sanitize-html` のパーサ/許可リストへ変更。既存の写真・リンクのホスト許可を保持。異常な数値文字参照も例外にしない |
| 大会・種目の並べ替え | 画面の古い行全体をupsertし、他端末で変わった名前/日付等まで戻す構造 | `competition-order.ts` は順序だけ更新し、各更新の実1件を確認。失敗・結果不明は再送せず取得し直す。既存の削除は共通safeDeleteへ統一 |
| 月間計画から予定とメニューを保存 | 予定保存失敗後の空予定insertと、React状態反映前の同日の重複insertをコードで確認 | `monthly-planning-save.ts` で同じ日に失敗した予定を再送せず、成功した正確な予定IDをメニューへ渡す。エラーを0件取得へ置換しない |
| 月間計画の下書き | month/scopeだけのキーに別アカウント・別宛先の入力が混ざり、保存済みスナップショットも復元される構造 | キーにアカウントと正規化した宛先を追加。未完了のdirty/errorだけ保存し、文脈変更前に旧入力を退避。共有FormModalの未保存・busy guardへ接続 |
| フォルダと編集者を保存 | 本文保存→編集者全削除→再insertが別取引。後半失敗で旧権限が消える | `save_note_folder` INVOKER RPCで一取引。期待updated_at、既存RLS、削除実件数を確認。非所有者は既存のtitle/status操作を維持し、管理項目の差分要求は全体拒否。入力できても保存されなかった説明欄は読取り表示へ修正 |
| 記事と投票を保存 | 記事→画像→選択肢削除→insertが別処理で部分成功する | `save_note_article` INVOKER RPCで本文・投票設定・選択肢を一取引。updated_atと基準選択肢IDの競合を拒否。既存DELETE/INSERT RLSを保持し、0件削除も取引全体を拒否。追加選択肢は保持したsort_orderの最大値の後ろへ追加 |
| 投票が届く瞬間に記事の投票を編集 | private votesの直接SELECTでは他人の票を判定できず、INSERT待機後に古いRLSスナップショットが残り得る | 既存の閲覧確認付き集計RPCを使用。INSERT triggerと保存RPCは記事ごとの取引advisory lockを共有し、待機後に同じ既存権限を再確認。DELETEにadvisory lockを足さず逆順deadlockを避ける。最終の選択肢ID集合も確認 |
| ホームの大会カウントダウンを変更 | 全解除→対象ONが別取引で、後半失敗時に全解除だけ残る | `set_competition_countdown` INVOKER RPCで一取引。決まった順に行をlockし、期待対象、管理権限、実件数を確認 |
| つぶやきと投票・メンションを保存 | 本体insert→投票insert→mention insertが別取引。投票エラー後に本体を削除する補償処理も結果不明時に危険 | 主担当の追加指示で `save_tweet` INVOKER RPCを別migrationへ追加。新規本文/poll/mentionを一取引にし、既存RLS・mention可視性・通知triggerを保持。編集は元contentのCASと本文だけで、引用/画像/期限/poll/mentionを保持。クライアント接続はUI担当 |
| 上記RPCの通信結果が不明 | 結果が不明な同じ作成を再送すると重複/権限再変更を起こし得る | `atomic-save.ts` は読戻し照合だけ行う。新規IDは同じフォーム内で固定。未知結果の間は入力を固定し、fieldset外の「保存結果を確認」から再送せず照合。カウントダウンは元のdesired/expectedを保持し、一覧が空でも確認可 |

`sanitize-html@2.18.0` と型 `@types/sanitize-html@2.16.2` を追加した。既存共有node_modulesを変更せずlock-only更新し、親担当が新規隔離依存へnpm ciしてworktreeのjunctionを切り替えた。採用根拠は[公式パッケージの許可リスト・パーサ仕様](https://github.com/apostrophecms/apostrophe/tree/main/packages/sanitize-html)。未解決の攻撃手順や実ユーザーのデータはテスト・文書へ入れていない。

## migrationと検証結果

`20261004040000_atomic_note_competition_saves.sql` は新規タイムスタンプの冪等migration。書込関数とtriggerはSECURITY INVOKER。新しい表・権限・service-role書込は追加せず、既存表のfailover記録を維持する。Supabase既定grantでPUBLICを外してもanonの個別EXECUTEが残ることを独立DBで確認したため、PUBLICとanonの双方から明示的に取り消した。

追加の `20261004050000_atomic_tweet_save.sql` も同じ独立DBだけへ適用した。画像pathは投稿者のprefixを確認し、アップロード自体と外部通知の配達をDB取引の保証には含めない。

親担当が作った独立Docker projectの `tuat-review-db` / `tuat_review` だけへ適用した。本番DBは適用していない。通常試験は合成owner/member/viewerのauthenticated JWT claimsで、mirror書込headerを使っていない。独立DBには本番行をコピーしておらず、外部通知triggerを親担当が無効化した状態で実行した。

- Node22 `tsc --noEmit --incremental false`: 成功。
- 担当15ファイルのeslint、最新UI/同時実行スクリプトの再チェック: 成功。
- 対象6 test files / 26 unit tests: 成功。外部HTMLの安全なmarker、順序更新の範囲・0件、下書きの所有文脈、予定失敗後の再送禁止、未知応答後の読戻しを確認。投票の未知結果は要求した削除IDが不在で、保持/追加IDの文言・作者が一致することまで確認する。投票を維持する際の合法な後続追加（元authorは追加許可offでも追加可）を成功照合から排除しない。
- `scripts/test-atomic-management.ps1`: 実DBで本文/編集者差替の失敗rollback、作成失敗時orphanなし、non-owner管理差分拒否、updated_at/選択肢ID競合、pollのRLS拒否rollback、他人の票非公開、投票済み選択肢拒否、明示poll解除、sortの隙間の後へ追加、カウントダウン2段目を合成triggerで失敗させても元対象保持を確認。fixture/triggerとも取引rollback。
- 同じDB回帰へTweet新規/poll/mention、poll制約やmention FKの後段失敗時orphanなし、固定IDの二度目拒否、他人編集拒否、旧contentのCAS拒否、本文編集後の引用/画像/期限/poll/mention保持を追加して成功。外部通知配達は未確認。
- 既存service_role mirrorのcreated_by保持も合成claimで確認。INSERT後の通常部員向け権限再確認は、既存のprivileged backend write権限を狭めない。これは本番mirrorの一連運用試験とは区別する。
- `scripts/test-atomic-management-concurrency.mjs`: 別2接続で無効化中の旧snapshot選択肢/投票INSERTを拒否、投票解除とpoll削除の並行実行でdeadlockなしを確認。生成した合成フォルダだけを終了時削除。
- `git diff --check`: 書式エラーなし。

R2画像はDB取引へ混ぜられないため、本文・投票成功後の別段階を維持する。画像API既存の固定uploadIdと成功済み処理の進捗を保持し、失敗表示では記事/投票の保存済み部分と残る写真処理を明記する。画像を含む全体が原子的になったとは報告しない。

## 未確認・反映の状態

この担当はcommit/push/deployを行っていない。本番DB/RLS parity、実ユーザーの保存、外部連携の運用、PC停止/復帰、実機iOS PWA/Androidの一連操作は未確認。新RPCが本番PCとクラウド双方へ備わるまで、本番コードの公開は完了条件を満たさない。対象行のsnapshot/dryRunと環境差確認は、本番適用を担当する主担当の次段階で行う。

本調査は静的な入口棚卸しと確認できた保存欠陥の修正を対象とし、全APIのライブ攻撃試験や全画面の実機UI試験を済ませたことにはしない。一般部員のメニュー下書き・複数ロール・既存画像認可など、最新の完了済み修正を未修正へ戻していない。

## サーバー側の本人情報の追加確認

サーバーの本人IDとプロフィール/ロールの照合を、署名・期限検証済みのJWTへ統一した。`getCurrentUserId()` と `getCurrentProfile()` は同じrequest内cacheの検証済みidentityを使う。proxyの確認だけに依存せず、APIから呼ぶ場合も独立に検証する。cookie内の未検証user情報をサーバーの認可へ使わない。

実Supabase SSR/Authライブラリと合成ES256署名による追加10回帰、既存roles/client-authを含む18回帰は成功。本人情報・プロフィール/ロール照合IDの一致、署名不正、期限切れ/更新、subject欠落/空/型不正、検証失敗後のcookie保持、プロフィール未作成時の検証済みemailを確認した。本人ID取得はDB0回。公開鍵の初回mock JWKS取得後はDB/Auth0往復、実環境の初回鍵取得・期限切れ更新・HS方式のAuth通信とは区別する。

型検査と対象eslintは成功。browser側の`client-auth.ts`はRLS操作用のidentity hintであり、認可の根拠へ変更していない。本番データ・実アカウント・外部書込みを使わず、具体的な手順や秘密値を記録していない。独立環境での実ブラウザ確認とローカルcommitの終了記録は、主担当の全体監査へ残す。
