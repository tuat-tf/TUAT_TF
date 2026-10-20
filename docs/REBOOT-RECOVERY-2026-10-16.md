# 再起動後の起動復旧（2026-10-16）

担当: Codex。目的は再起動後に同じ暗号化領域・DB・認証・画像・Jobs履歴を保持して正式起動を復旧すること。起動タスクはstart-and-observeで失敗、WSL停止、公開versionは503を再現した。

再起動前のNode backup-owner.lockが残り、排他的新規作成でアプリが終了した。旧PID不在、app failed、host lifetime FLOCK取得を確認し、元lockを暗号化privateへ移して正式タスクから起動。公開version 4051ea1、Jobs、timer、正式watchの復旧を確認した。業務保存の再送、旧writer再開、DBの作り直しはしていない。

受入: 正式bootstrapは停止した所有者だけを検証して元lockを保全し再起動できる。生存PID・取得できないOS排他・不正/競合lock・対応しない世代は拒否する。backup attemptとjournalは変更せず、結果不明を再送しない。修正はまず隔離検証し、既存appを止めず次回起動loaderへ適用する。OSの再起動実試験は所有者操作が必要であり、今回のサービス復旧と区別する。

## 終了記録

21:42 JST頃に公開versionの200と最終公開SHA 4051ea1の一致を確認。app・Jobs・15分timer・正式Windows S4U watchは継続稼働。新世代の一体backupは21:42:39 JSTにR2読戻し・別DB復元まで検証済み。旧writer・同期queue・失敗履歴・DB/Auth/画像は作り直していない。

修正は正式bootstrapのapp起動直前に限定した。backup設定の固定領域とinstance ID、旧lockとlifecycleの世代一致、旧PIDのESRCH、host lifetimeの実FLOCK、元inode/bytes不変を照合し、暗号化privateに原本をfsync保全してからlockを外す。生存PID・再利用PID・EPERM・競合・別世代・不正ファイルは拒否し、backup attempt自体は再送/成功化しない。

本番の /opt/tuat-local-runtime/pc-bootstrap.py とWindows loader pinを同時に更新しhash一致を確認。旧loaderと設定も非公開で保全。現行の生存FLOCKに対して新helperが拒否し、サービスが維持されることを確認した。現在のwatchは停止せず次回起動から新loaderを使う。一時sleepだけをpidfdと実行ファイル/argv照合で終了し正式監視へ引継いだ。

検証: 環境チェック、tsc、全Vitest177ファイル1,653件、Linux bootstrap39件、diff check。Pythonファイルはeslintの対象外。Vitestはsandbox一時領域のrename制限で一度実行不能となり、専用一時領域で全件成功。アプリコード・公開releaseは変更していないためbuild/push/Vercel配備は行わず、修正sourceと記録をローカルcommitに保存する。OS再起動からの再発防止実試験、本人端末でのログイン/保存/PWAは未確認。
