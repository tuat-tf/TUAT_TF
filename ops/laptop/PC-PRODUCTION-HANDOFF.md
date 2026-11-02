# PC本番運用の引き継ぎ

更新: 2026-11-03。現行の要点だけを置く。2026-09〜10-22の経緯・旧構成（Vercel＋WSL Supabase、Quick Tunnel、R2の15分バックアップ、Windows backendタスク、旧URL・SHA）は [履歴](../../docs/history/PC-PRODUCTION-HANDOFF-2026-10-22.md) へ移した。履歴の値・コマンドを現在値として使わない。

## 現在の構成

- アプリ・DB・認証・画像の正本は、このPC内の暗号化WSL領域 `/var/lib/tuat-local`。公開入口は Cloudflare の https://app.tuat-tf.workers.dev 。旧Vercel URLは残るが主系ではない。
- 稼働commitは公開 `/api/version`・GitHub master・PC runtimeの3つで照合する。過去の文書に書かれたSHAを使わない。
- 本番反映は `ops/pc-host/pc-release.py release <commit>` だけで行い、旧release世代は `prune` で片付ける。手順は [本番反映のスクリプト化](../../docs/PC-RELEASE-SCRIPT-2026-10-23.md)。
- 運用は部活管理へ移管済み。移管内容と引き継ぎ資料は [完了照合](../../docs/REMAINING-WORK-2026-10-22.md)。

## バックアップ

- DB・認証・画像のcombined backupは日次・オンライン採取。暗号化して部活Google Driveへ保存し、読戻しと別DB復元で確認する。詳細は [負荷修正記録](../../docs/BACKUP-LOAD-2026-10-22.md)。
- 通常保存とJobsはバックアップの鮮度に依存せず、同一host/DBと120秒の心拍で可否を判定する。
- 未整理の旧世代（旧32個・出自未照合3個）は、記録の照合手順を終えるまで削除しない。

## 維持する無効状態

旧PC/cloud source fence、旧cloud Data API off、旧relay retired503、旧Windows backend（`TUAT PC Backend Temporary`・`control-backend.mjs`・`restart-backend.ps1` 系）と旧Jobsの無効状態を維持する。旧queueの再送・予備への書込み・書戻しを再開しない。

## 停止・再起動の注意

- 計画的にappを止める前に、正式監視と独立した保全監視を先に用意する。正式監視はappの短い停止も異常として終了し、その後にWSLのサービスとmountが落ちた実例がある。
- 暗号化領域のmountは、作業用WSLプロセスではなくPID1/systemdのmount namespaceで同じUUIDを確認する。callerだけのmountではサービス起動がskipされる。新しいストレージや別DBを作らない。
- 再起動後に旧 `backup-owner.lock` が残って起動に失敗した実例がある。旧PID不在とhost lifetime FLOCKを確認してから保全復旧する。詳細は [再起動後の復旧](../../docs/REBOOT-RECOVERY-2026-10-16.md)。
- 全Node終了・WSL全停止・Docker volume削除を通常の操作にしない。`D:\TUAT_TF\node_modules` を消さない。

## 秘密情報

秘密値・復号鍵・実データの退避先を表示しない、ログや報告に出さない、Gitへ入れない。別端末への受け渡しは所有者の安全な経路で行う。

## 未確認

OS再起動の再試験、スマホ実機での最終保存・PWA起動は未確認。旧Vercel originで作ったホーム画面アイコンは自動移管されないため、新URLをSafariで開いて共有→ホーム画面に追加し、新アイコンの起動を確かめてから旧アイコンを消す。

## 別端末からの作業

コード修正・テスト・レビューは最新masterで可能。DB・認証・本番反映・秘密情報の変更はこの本番PCで状態を確かめて行う。別PCの同名ディレクトリやローカルDBは本番データではない。
