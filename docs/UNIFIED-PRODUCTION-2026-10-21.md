# 保留中の統合版の一括本番反映（2026-10-21）

所有者から本番反映の保留解除と一括公開を指示された。統合版4013c24と、その後のシート計算距離の送信除外・OBリレー2組目追加を検証し反映する。root/別担当の未コミット成果を保全する。

## 受入条件と境界

- PCの現正本・本人ID・画像・Jobs履歴を保持し、別releaseをビルド/検査してから単一writerを切り替える。正式監視を補う保全を先行し、本番依存・WSLを準備中に止めない。
- migrationの実履歴と対象を確認し、暗号化領域へのsnapshot・dryRun・保持検査を先行する。結果不明の適用/保存は再送しない。
- 環境・型・eslint・全Vitest・必要なDB/運用/UI検証、公開直前buildを行い、masterへまとめて1回pushする。PC releaseと公開version、対象Vercel Production成功を照合する。
- URL変更は別作業で新Cloudflare account認証が未完了との記録がある。現在のアクセス状況を確認し、未取得の新URLへ誘導しない。アカウント所有権移管の準備文書は、実移管の完了や追加課金の承認と解釈しない。
- 開始時点では本番未変更。実機検証と合成検証を区別して記録する。

## 公開前検証
未計測表記の追加修正も同梱する。7 migrationを本番snapshot後にトランザクション内で試行しrollback成功。113表の既存データ・役割・1組目保持と2組目追加を確認。新URL用CloudflareアカウントのAPIは403のため既存originを維持。移管文書は準備資料として別管理で、アカウント移管は今回実施しない。

## 本番反映完了（10/22 00時台）

- 公開commit: `ff64a7d9652dd9925ca537821ccb413797f41424`。masterへfast-forwardし1回だけpush。別担当のmaster worktree文書差分とroot差分を保持。
- 全Vitest208ファイル1,839試験、型、対象ESLint、Node24環境診断成功。隔離DBで222 migrationとSQL/RLS/画像競合を検証。Linuxの別releaseでネットワーク隔離build・非特権起動・ログイン画面/匿名拒否・静的ファイル・旧API停止を確認し、39,379ファイルの成果物を固定。
- 本番の7 migrationは、暗号化領域へのDB/roles退避・rollback付きdryRun・対象/ソースハッシュ照合後に単回適用。113表の既存行、役割、リレー1組目を保持。2組目6レーン追加と未計測ハイフン検証を含む。退避・実データ証跡は公開Gitに含めない。
- PC releaseを切替。DB/Auth/REST/Tunnel・画像・Jobs履歴を保持。公開Cloudflare `/api/version` は同じSHA。VercelはGit pushで開始されなかったため、既存設定を変えず公式APIへ固定SHAのProductionを単回要求。`dpl_5DKu6RMMY32et4NWHHyPisj45L1A` が `READY`・target production・meta.githubCommitSha一致。旧Vercel `/api/version` も同SHA、`/login` は現Cloudflareへ307。
- Cloudflare `tuat-pc-app` に374公開ファイルをasset-firstで反映。version `90463afc-24ba-408f-b853-caf63e958ffc`。既存origin/VPC/他Workerを保持。新旧のハッシュ付きファイルは併存。NextのdeploymentId有効時は固定buildIdになり `_buildManifest.js` の内容だけが衝突するため、当該可変manifestは双方の静的bundleから除外しPC経由に維持。変更したNext設定は残していない。退避bundleを消さず、専用combine手順と標準verifyAssetsBundle/check-configで全ファイルを検証した。将来のbundle作成でも同じ衝突の確認が必要。
- 公開でJSのMIME/immutable cache、欠損hashの404、匿名homeのログイン誘導を確認。実ブラウザの既存ログインでホーム・予定・ノート件数・旧OB大会結果とリレー2組目を確認。ノート上の画像3件が192px thumbnailで正常表示。新規Googleログイン、実ユーザーの保存/削除、スマートフォン実機、Cloudflareアカウントの日次削減量は今回未検証。

## 切替中の復旧と運用確認

- 初回backupは容量基準で採取前に停止。基準を緩めず、使用中でない旧release `096bbd2` と `0acc6f7` を同じ暗号化領域内に圧縮退避し、全ファイル/リンクの読戻し一致を確認して展開済みコピーを整理。現行ff64a7dと直前39c525dを保持。空き約3.8GiBへ回復。
- 新世代backupの復元/R2読戻しが成功してJobs/timerを再開。直後のtimerは実行中Jobsを捕捉して保護停止。dump/送信前の失敗・全writer復帰・空stage・receipt不変・archive/producerが試行前から不変を確認し、元unknown-holdを保全してrefusedとして整理。成功へ書換えず新捕捉を実行し、再び復元/R2読戻し成功。最終backup18,288,676bytes、SHA256 `5db2d3380ed9ad05c73176c2a7b6c3eda1097556b4940bb6bcbc5783e880705e`。
- runtime全体 `--check` がvalid。app/Jobs/timer/Tunnel、正式watchが正常。期限付き保全プロセスを終了。既存DB正本、バックアップの保持方針、秘密・権限を維持。

## 別途残る確認

- 新URL用TUAT TF CloudflareアカウントはAPI403で未認証。今回の公開は既存URL。アカウント移管・新URLへの切替は未実施。
- シート書込みは公開前からblocked=true（旧8履歴）。再開時も安全側のskipを保持し、HTTP200でも未解決状態を成功とせず9履歴になった。新しい記録はsheetWritesSkipped=true/uncertain=true。過去の結果不明送信は再送・解除していない。今回の計算距離除外修正は公開済みだが、過去の同期結果照合は別途必要。
- 静的配信でWorkerを通るリクエストを減らす構成を反映したが、動的通信は残る。アカウント全体の上限非到達や削減率は保証・実測していない。

完了追記は文書のみとしてローカル保持し、追加push/build/deployは行わない。
