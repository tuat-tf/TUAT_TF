# 承認済み残作業の完了（2026-10-22）

## 開始・受入条件

所有者の「他に残りの作業があればやりきって」に対応。統合版の未公開差分と最新master 66a71c9を照合し、投票・ストーリーの共通UIと大会自動取得期限の2件を対象とした。既存の移管・ブログ・役職・フォルダ・出欠・日次バックアップ修正は再実装しない。調査のみと指定されたOB改善一覧は対象外。

- 投稿/ノートの投票切替と追加・取消・画像操作を共通部品へ統一。匿名性・票の削除保護・失敗時入力保持を維持する。文字案内を増やさない最新指示に合わせ、提案差分の投票説明文は追加しない。
- JST開催前日〜終了翌日だけ自動取得する。複数日と終了日省略、手動取得の例外を維持する。実日付での将来実行は未再現で、実routeを固定時計で試験する。
- 引き継ぎ文書の15分定期・固定パックと現行版の混同を訂正。旧構成を復旧時に戻さない。既存の原本・共有・DB・認証設定を変更しない。
- 失敗時は保存状態を既存照合で確認。公開は直前版を固定した既存手順で切替し、結果不明のapplyは再送しない。

鍵の独立保管と別PC全体復旧は本人が後続へ回した項目。旧32世代と出自未照合3世代は削除しない。公式速報の未公開データ取込成功は今回の期限修正で証明できない。

## 検証

Node 24.19.0でTypeScript・対象ESLint・全Vitest 225ファイル/1,962試験成功。環境診断は直前の同一依存/環境での成功を再利用。実routeのJST境界5試験と、実ブラウザの合成RPCによる投稿/ノート保存、票取消・選択肢追加/取消を確認。390px幅で横スクロールなし。投票票数の削除保護は既存テストも成功。実機・実データへの投稿は未実施。引き継ぎ診断は旧15分記述を除去し、固定復旧パックと現在の稼働版を分けた。

## 本番反映完了（2026-10-22 18:54 JST）

- commit/master/公開version: `dd0c1f192df4b4c47fd4af0d3a19a881bb093711`。1回のmaster push、Linux隔離build・起動・成果物全体検査成功。
- 公開URL https://app.tuat-tf.workers.dev の `/api/version` と配信JS hashが一致。Cloudflare version `0a1f4c67-4f2c-4d63-8076-83d342001f21`。旧ハッシュ資材を保持して切替。
- PC release `/var/lib/tuat-local/releases/dd0c1f1`、runtime SHA `a7737701fe7bba03bd86dd0ecf55ec95fda135b07d5ae185bac39b3692c2ccc5`、generation `8369cf94-dac4-4538-a0d3-6d0175f2f990`。DB/Auth/REST/Tunnel identityを保持し、新世代でもbackup鮮度による保存拒否を復活させていない。
- Jobsを先に再開し、過去送信の再実行0。app/Jobs/timer/Tunnelと正式監視は正常。一時保全プロセスは終了済み。
- timerは `OnUnitInactiveUSec=1d`。既存timerが始めた切替後1回のオンライン採取について、18,339,876 bytes・Drive読戻し・隔離復元成功を確認。追加の手動採取は実施しない。
- 390px合成画面の保存先はGit外 `.contingency/remaining-mobile.png`。スマホ実機の新UI操作と実サービスへの投稿は未確認。検証プレビューは終了した。リサイズ時にViteのResizeObserver通知が出たが、DOM幅390px/scroll幅390pxと操作結果を確認。動作失敗やデータ更新は発生していない。

今回確認した承認済み未公開コード2件は反映完了。引き継ぎ文書の15分記述・固定d4cfda5パックを現行版とする説明も訂正した。復号鍵の独立保管・別PC全体復旧は本人の後続指定を維持。旧32世代/未照合3世代の出自整理と削除は今回行わず、公式未公開結果の取込確認、調査のみのOB改善一覧も完了済みとはしない。

この公開後追記はローカル保持し、文書だけの追加push/buildは行わない。

## 運用移管の完了照合（2026-10-22 19:02 JST）

直前ターンは未公開2件の本番反映という進捗あり。移行goalの完了はそれだけでは証明できないため、現在の外部管理状態と稼働設定を改めて照合した。

| 要件 | 現在の証拠・判定 |
| --- | --- |
| GitHubを部活管理へ | GitHub APIでtuat-tf所有、collaboratorはtuat-tf/adminのみ、master dd0c1f1を確認。完了 |
| 公開入口・PC接続を部活Cloudflareへ | 公開version dd0c1f1。稼働Tunnelのtoken-fileを値非表示で照合し部活account f08f5537… / Tunnel 6543c38e…を確認。旧Tunnelは稼働接続に不使用。完了 |
| Google Cloud・OAuth管理を部活へ | 実IAM画面にtuattf.sys@gmail.com/オーナー1件。Google Auth Platformは本番環境。旧OAuth秘密無効化は実施済み記録を維持。完了 |
| Sync GAS・OB GASの実行主体と接続 | runtimeのSync URLが承認済み部活配備に一致。部活GoogleでOB GASの18:44までの毎時処理成功、v4 doPost成功を実行履歴で確認。OB部活シートへの切替・13タブ照合・296件dryRun0差分の記録を保持。完了 |
| 本人権限と部活Gmailの境界 | 実正本READ ONLY照合で本人のシステム/管理者/OB戦2026/会計の4ロール、system=true。部活Gmailはprofile0/allowlist0。完了 |
| 他人所有の練習シートを維持 | 最新指示どおり10月シートの内容・共有・接続先を変更しない。旧いいねコピーは対象外。今回もシート変更0 |
| カード不要のDrive保存・軽い日常運用 | 稼働設定のDrive owner、online採取、日次timerを確認。直前の実自動実行でDrive読戻し・隔離復元成功。新たな採取なし。完了 |
| 後任が読める引き継ぎ手順・設定・不足診断 | ローカル最新版とDrive版がずれていた5件を更新。前回の固定snapshot日時訂正を先に照合・保持し、本文SHAと非公開権限不変を全件読戻し確認。固定6部パックは変更せず、現在の日次運用とGit/成果物対応を明記。完了 |
| 稼働維持・定期処理・正本一つ | dd0c1f1切替時のDB/Auth/REST/Tunnel同一性、app/Jobs/timer/Tunnel・正式watch正常、一時watch終了の実証を使用。旧writer/旧Jobs/旧queueを再開しない |
| 本人のスマホ確認 | 本人から「スマホで動いた」を受領済み。再質問しない。すべての新UI・端末・PWA個別操作まで拡張しない |

Drive更新は入口、README、SETTINGS、OWNER-INPUT、inventory例の5件。既存ID・非公開・部活単独所有を保持。暗号化archive、Google Sheets、権限、秘密鍵は変更0。証跡 `/var/lib/tuat-local/private/recovery-kit-d4cfda5-20261022/instructions-final-dd0c1f1/verified.json` と `/var/lib/tuat-local/private/installation-dd0c1f1/migration-completion-audit.json`（Git外）。

入口: https://drive.google.com/file/d/1h7PQH3mmAydy5YpBNbtHIPmM0wP8zCJU/view?usp=drivesdk

部活アカウントへのサービス運用移管は完了。所有者が後続へ回した復号鍵の独立保管・後任への実際の受渡し・別PC全体復旧は未実施のまま区別し、移管停止条件へ戻さない。旧archiveの出自整理、OS再起動の実機試験、公式未公開結果確認、調査限定の改善案を完了と主張しない。この完了は物理的な別PCへの移設済みを意味しない。

今回の変更は引き継ぎ文書のみで、追加のbuild/deploy/pushは行わない。現在のサービス設定は変更しない。
