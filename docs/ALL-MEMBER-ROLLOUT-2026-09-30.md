# スプシ設定・iOSガラスタブの全員展開

2026-09-30、オーナー「全員にスプシとガラスUIを本番反映して」に基づく。

全員に起動時の入力方法確認と、マイページ → 設定 → 練習記録の設定画面を公開する。入力方法は両方入力・アプリのみ入力（送信継続）・連携なし（送受信停止）の3種類。各自の既存設定・過去の記録は一括変更しない。

ガラスタブはロール条件だけを外し、iOSモバイル幅に公開する。Android・PC・低減設定の扱いは維持。管理メニュー、OB戦など他機能の権限は変更しない。プロフィールから旧シート設定を上書きしないよう、設定へのプロフィール集約も全員に適用する。

シートのAPIと本人用DB保存関数のシステム限定を解除。保存先は auth.uid() に固定し、直接の切替JSON更新拒否と入力取込ガードを維持する。既存の設定案内1件を全員公開にする。通知の追加はしない。

定期同期・即時送信・空欄化も全員共通の日付振分けにする。10月以降は各自の確認済み新シート、9月以前は旧設定で10月7日いっぱいまで。未確認の10月記録や送信先未確定の返信削除を旧スプシへ送らない。PCの固定releaseも更新が必要。GASは既存v20で対応済み。

## 検証と保全

- PCのpublic全体と対象関数を `/opt/tuat-tf-supabase/backups/all-member-20260930/` に退避。クラウド対象8表をアクセス制限付き `.contingency/backend/all-member-cloud-data-before-20260930.json` に退避。
- 対象2関数はPC・クラウドで空白正規化後のhash一致を確認。PC側の関数退避はクラウド側の復旧にも使用可能。
- 両DBでmigration二重適用・一般部員の3方式保存・他人の設定不変・直接更新拒否・匿名拒否・旧設定保全・off時取込拒否・日付別の返信削除先・案内のRLS閲覧をROLLBACK検証済み。
- クラウド管理画面の適用予定SQLとGit側migrationはコメント/空白除去後の長さ2374・hash4007484709が一致。
- WebKitで一般部員の設定画面、off / app_only保存失敗と再試行、320pxの幅を確認。Chromium/WebKitでガラスタブの全ロール表示、320/390pxのタブ移動・長押し往復・フォーム・低減設定・PC/Android対象外を確認。
- TypeScript・対象ESLint・全テストを確認。本番build・dry-run・公開SHA・PC固定release・両DBの最終照合は反映時に確認する。

実ユーザーの設定を代理保存せず、実スプシへの試験書込みもしない。iPhone実機は未確認。未反映のコメント削除監査は含めない。

## 本番反映完了

- `65336838372df7719fee44ef4bc50c7745491263` を master へ1回push。Vercel本番とPC previewの公式チェックsuccess、公開 `/api/version` とPC `127.0.0.1:3112/api/version` が同一SHA。
- Production: https://vercel.com/paimondayos-projects/tuat-tf/AHPayxMfdqnaZySJGNbWH1DtBUsx
- 両DBへ20260930020000を適用。変更対象関数は適用後も正規化hash一致。既存案内の全員公開・全員のsheet_transitionが事前退避と一致することを両DBで確認。公開GET/POSTの未認証アクセスは401。
- 全530テスト、tsc、対象eslint、Next16.3.6のPC本番設定build成功。dry-runは記録insert13/update66/push2・failed0、大会成功。
- PC固定release `.contingency/pc-jobs-6533683` へ切替。既存activateAt維持、18:00大会処理success。予備同期再開後もsuccess。

## 夜間同期の停止復旧（最新。過去の「failed journal保持」より優先）

切替後の最終確認で、9/29 00:00 JSTにGAS接続1件が部分失敗したため、schedulerの安全停止が残り、後続日の夜間同期も実行されない状態を発見した。過去の成功・失敗履歴を確認し、現在の全件dry-run失敗0、対象48人の1巡完了、新しいバックアップを根拠に復旧した。

- 追加退避: `/opt/tuat-tf-supabase/backups/all-member-20260930/pc-before-sync-recovery.dump`。
- runner終了後、元journalと失敗内容をアクセス制限付き `.contingency/backend/sheet-journal-before-recovery-20260930.json` に保存。既存失敗を成功に書き換えず、sheetsだけを新しい時刻枠で再実行できる状態へ戻した。他のジョブ・activateAtは保持。
- 18:03:55〜18:04:37 JSTの実同期で取り込み/更新79件・送信2件・失敗0をDB履歴で確認し、runner自身もsuccessを記録。これは試験データの送信ではなく、承認された本番同期の復旧実行。
- 次回10/1 00:00 JSTのsheetsが実行可能であることをschedulerのdueJobsで確認。18:04:54の予備同期もsuccess。
- 復旧記録: `.contingency/backend/sheet-recovery-result-20260930.json`。

この完了記録とAGENTS更新は手元に保持。文書のみの追加pushはしない。iPhone実機の確認は未実施。
