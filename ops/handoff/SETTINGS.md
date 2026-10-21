# 設定と復旧資材

2026-10-22の稼働版92e8b09、`ops/local-minimal/runtime.py` の `pc-private` を基準とする。保存先は部活Google Drive、公開入口は部活Cloudflare。値ではなく項目名を管理し、現行設定・秘密値をこの文書へ貼らない。新ホストのruntimeを自動生成・有効化するものではない。

## runtime設定一覧

| 既存項目 | 保持・変更の方針 |
| --- | --- |
| version / profile / installEnabled | 形式・pc-privateを確認。検証先を本番として有効化しない |
| sourceId | archive/receiptの採取元と対応。新sourceと復元元の関係は正式移設で確定し、機械的に置換しない |
| mountPoint / mapperName | `/var/lib/tuat-local` / `tuat-local-data` が現行契約。保護を外さない |
| luksUuid / filesystemUuid / backingFile | 元を証跡保存。移設先の実ディスクで確認し、旧値の丸コピーで起動しない |
| appUid / appGid | PC profileは65530。ファイル所有者との一致を維持 |
| nodePath | `/opt/node-v24.19.0-linux-x64/bin/node`。OS/CPU・依存版を確認 |
| releaseDirectory / releaseManifest | release成果物と完全なinventory。SHAだけで復旧可能とはしない |
| appEnvironmentFile | origin・Auth/API・画像・署名・連携等。非公開移送。origin変更時はbuild時設定も確認 |
| dbEnvironmentFile / authEnvironmentFile / restEnvironmentFile / mixedJwks | DB・Auth・RESTの対応。利用者ID・署名鍵・issuer等を別レビューで照合 |
| dbData / imageRoot | 統合archiveから復元。稼働中の生DBをコピーしない |
| jobsConfig / jobsStateRoot | 設定とactivation/journalを保持。旧PID/ロックを現役にせず、結果不明を再送しない |
| dockerRoot / containerdRoot / privateLogDirectory | 移設先の暗号化領域・所有権を確認。旧daemon状態を丸コピーしない |
| backupConfigPath / offsiteConfigPath | 採取・鍵・Drive保存先の対応と世代。検証先で送信を有効化しない |
| hostConfigPath / daemonSeal / dbHba | 専用daemon・配置の検証。対象ホストで保護条件を満たす。旧sealを無理に通さない |

## filesの対応

実際の復旧用コピーを指定する。複数ファイルを含む項目は既存の非公開保管方式でまとめ、その保管物を指定する。この検査のために秘密を平文で集め直さない。

| キー | 必要物 |
| --- | --- |
| archive | 現行統合backupの暗号化ファイル。旧dump.encを混同しない |
| producerReceipt | 同じarchiveのproducer receipt。offsite履歴/local-snapshot.jsonで代用しない |
| runtimeConfig | 元runtime.jsonの復旧コピー。そのまま新ホストで有効化しない |
| backupConfig / offsiteConfig | runtimeが参照する設定コピー |
| appEnvironment / dbEnvironment / authEnvironment / restEnvironment | 対応するEnvironmentFileの非公開コピー。診断器は内容を読まない |
| mixedJwks | runtimeが参照するREST用の鍵セット。公開鍵だけとは決めつけず非公開保管 |
| vaultKey | DB Vault復旧鍵。dumpに全て含まれると推定しない |
| recoveryKey | 元PCなしで取得できる独立復号鍵。正しい32byte鍵かは隔離した既存鍵照合/復号試験で確認 |
| jobsConfig | 現行Jobs設定。履歴はarchive内だが、外部結果・保留は別確認 |
| releaseManifest / releaseBundle | 一致するrelease inventoryと成果物一式。元PC依存も確認 |
| hostConfig | hostConfigPath等の復旧用設定 |
| tunnelCredentials | 公開入口への接続資材。Cloudflare管理権限とは別 |
| offsiteCredentials | Driveの専用OAuth client/token/folder設定。復号鍵の保管と分離。元PCを失った場合は部活Driveの画面から取得できることも必要 |
| bootstrapBundle | 適用済みbootstrap、Windows loader/pin、systemd/daemon定義等。一式の版とGitとの差を記録 |

既存BACKUP.mdでは、DB dump、ロール・権限、Auth利用者/identity、画像bytes、Jobs journal等が統合採取・復元照合の対象。一方、DBログインパスワードやサービス設定・外部資格情報は別保管。
実snapshotは既存復元検証で113表・70画像を照合済み。定期Drive保存も切替済み。設定・成果物の復旧支援パックはsnapshotと別に保管し、それぞれの取得・復号・内容照合の証跡を使う。これだけで別PCでの全サービス再起動を証明したとはしない。

## 現行offsite環境

`BACKUP_STORAGE=google-drive` と `DRIVE_CLIENT_FILE`、`DRIVE_TOKEN_FILE`、`DRIVE_FOLDER_ID`、`DRIVE_OWNER_EMAIL` を使用する。`PC_BACKUP_ENCRYPTION_KEY` は既存復号鍵の64桁hexで、復旧支援パック内のoffsite.envからは除外する。復旧時に独立鍵から再構成し、暗号化パック内 `source-inputs.json` の元SHAと一致させる。個人側R2の資格情報を復元先へ混ぜない。

Windows起動設定は復旧資料として保持するが、機械固有DPAPI blobは別PCへ持ち出しても使えないためパックへ含めない。復元先のLUKS鍵・UUID・Windows DPAPI・タスクを正規手順で作成し、旧runtimeのパスとsealを無条件に有効化しない。

## reviewsの対応

| キー | 記録すべき確認 |
| --- | --- |
| independentKeyCustody | 元PCなしで鍵を取得可能。archiveと独立保管。独立コピー一致の証跡と実際の取得可能性 |
| releaseMatchesSnapshot | SHA、成果物、DB/migration互換、現場bootstrap修正が対応 |
| authAndSigningKeys | Auth/JWKS、Vault、画像/action署名、VAPID等が復旧可能。設定との対応と鍵の無断再生成なし |
| jobsHistoryAndExternalOutcomes | activation/journal、失敗・部分・結果不明と外部送信保留の保持 |
| googleOAuthAdministration | OAuthプロジェクト・クライアント・callback管理者と引継先。アプリ利用者IDとは別 |
| sheetsGasAdministration | 現行シート・GAS・実行主体・デプロイ・管理者。廃止済みDrive連携や予定同期は再開しない |
| cloudflareAdministration | Worker・接続・URL管理権限。Google作成だけで移管済みにしない |
| backupStorageAdministration | 部活Driveフォルダの所有者・非公開権限、専用OAuth、保存世代・復旧支援パックの取得。旧形式1のr2Administrationは旧R2だけの確認 |
| repositoryAdministration | リポジトリ管理と非公開資材の受渡し、ローカルだけの変更の把握 |
| privateFilePermissions | Windows ACL/Linux所有権・権限、保管/移送方法、不必要な共有がないこと |

## 部活用Googleアカウント

所有者回答: 個人Gmailを管理主体とし、アプリ運用全体（GAS等を含む）を部活管理へ移す。最終管理者は部活側のみ。Google/GitHub/Cloudflareのアカウント作成と認可を受領し、主要運用を部活側へ切替済み。復旧先の実機は未定。旧権限の撤去と、大学/他部員が所有するSheetsの境界整理は未完。
私用の無関係な資産や他アプリは対象にしない。追加質問を逐次行わず、本人操作と不足情報を最終一括確認へまとめる。
OAuth、シート/GAS、復旧情報、アプリ利用者は別対象として記録する。私用アカウントの既存利用者ID・投稿をメール文字列だけで付け替えない。
移管可否・手順は実施時に現行仕様とアカウント種別で確認する。共有しただけで所有者やGAS実行主体が変わるとはしない。新管理者の確認が済むまで旧アクセスを外さない。
承認済みの共有・移管・認可は再質問しない。新管理者での操作が確認できるまで、必要な旧アクセスを削除して唯一の管理経路を失わない。
