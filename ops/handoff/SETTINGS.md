# 設定と復旧資材

2026-10-22更新の固定復旧支援パックd4cfda5、`ops/local-minimal/runtime.py` の `pc-private` を基準とする。稼働版は公開 `/api/version`・master・PC runtimeで照合し、この固定パックの版と区別する。日次バックアップと通常保存の切離しは[最新記録](../../docs/BACKUP-LOAD-2026-10-22.md)を参照する。保存先は部活Google Drive、公開入口は部活Cloudflare。値ではなく項目名を管理し、現行設定・秘密値をこの文書へ貼らない。新ホストのruntimeを自動生成・有効化するものではない。

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

所有者回答: 個人Gmailを管理主体とし、サービス運用全体（GAS等を含む）を部活管理へ移す。サービス管理主体は部活側とするが、アプリ内の本人の管理ロールは維持する。部活Gmailはアプリへ登録しない。Google/GitHub/Cloudflareのアカウント作成と認可を受領し、主要運用を部活側へ切替済み。復旧先の実機は未定。10月練習シートは外部共有資材として維持する最新指示を、全所有権移管という以前の解釈より優先する。

Google CloudのプロジェクトIAMは部活オーナー1名へ整理済み。Web OAuthのredirect URIは現行Cloudflare URLの1件、JavaScript originは0件。2026-06-18作成の旧秘密は一括承認を受け無効化済み（削除なし）。実稼働Authが使用する2026-09-09作成分は有効のまま保持した。
アプリ内の権限移管は担当の誤解だったため取消済み。既存RPCで本人のシステム・管理者・OB戦2026・会計の4ロールを復旧し、部活の3管理ロールは解除した。RPCの再登録により本人の割当created_atは更新されるが、ロールID/実効権限は元に戻した。他利用者の割当・本人プロフィールは不変。部活Gmailの空プロフィールとログイン許可も、関連データ0件とdryRunを確認して取消した。Authの監査用IDは保持しているが、アプリログインは拒否される。サービス側のGoogle認証・Drive・GASには影響しない。
GitHubは部活tuat-tfが所有/管理し、旧個人PaimonDayoのwrite collaboratorを解除済み。repository webhook・deploy key・Actions secret・保留招待は0件。個人アカウント自体や他リポジトリの認可は変更していない。
旧Cloudflareの専用Tunnel/VPCは削除済み。旧中継WorkerのR2 bindingとPC_BACKEND_BRIDGE_KEY/SUPABASE_ANON_KEYを解除し、停止flagと全メソッドの503拒否を保持。部活Tunnelと現在の公開入口は稼働。旧R2オブジェクトや無関係な資産はこの撤去対象に含めていない。
私用の無関係な資産や他アプリは対象にしない。追加質問を逐次行わず、本人操作と不足情報を最終一括確認へまとめる。
OAuth、シート/GAS、復旧情報、アプリ利用者は別対象として記録する。私用アカウントの既存利用者ID・投稿をメール文字列だけで付け替えない。
移管可否・手順は実施時に現行仕様とアカウント種別で確認する。共有しただけで所有者やGAS実行主体が変わるとはしない。新管理者の確認が済むまで旧アクセスを外さない。
承認済みの共有・移管・認可は再質問しない。新管理者での操作が確認できるまで、必要な旧アクセスを削除して唯一の管理経路を失わない。

## 練習シートの維持境界

旧「練習記録2026.3/23～」は `1uAo7E8_rMbUZlml1H0vj119htQeoa2eMWqASUXQTqgg`。現行Sync GASのSPREADSHEET_IDで確認した。10月の現行シート `18HKZrVL-JtXbZ9zcYUFPRPGIGCpd7ltLOsmvBKdJfR8` と同じ大学アカウントが所有し、元ファイルはリンク編集可能。学校アカウントから組織外への所有権直接移管はできない（[Google公式](https://support.google.com/drive/answer/2494892?hl=en)）。

旧シートの部活保管コピーは `1XaXqJ0ybqy25PUHFPYI1MsbpjN7ilPILIUcfvdxHv20`、名前は「練習記録2026.3/23～（部活保管・移管準備）」。2026-10-22 08:43に部活My Driveへコメント・解決済みコメントもコピーする指定で作成。元の共有相手はコピーせず、部活オーナー1件・制限付きであることを確認した。添付Apps Scriptもコピーされるため、内容と実行設定の確認が必要。標準XLSXの2回ずつの照合でセル・式・書式と出力されたコメントが一致。Google固有情報とコメントスレッド全体は未検証。現在のGAS設定や入力先は変更していない。

最新の所有者指示により「練習記録2026.10/1～」は本人所有ではなく部員全体で長期共有される外部資材として維持する。内容・所有者・共有・URL・GAS接続先を変更せず、コピーも作らない。Sync GASを部活実行にすることと、シートの所有権を変えることは別であり、前者は実施済み。このシートの移管を今後の必須作業として復活させない。旧練習シートのコピーも保管用であり、入力先を切り替えない。

### 付属GASの照合と旧いいね管理

部活保管コピーの付属GASと元GASは全文21,397文字・改行正規化SHA b48b0a405cef2628a6c9e927bf3f4c3d48fc5b5bc165423ab6af2300d4f9a7d9 が一致。部活コピーにはトリガー0件・配備0件、単純onOpen/onEdit/onChange関数もない。SPREADSHEET_IDとREACTIONS_SPREADSHEET_IDは元を指したままなので、新しい入力先として実行しない。

REACTIONS_SPREADSHEET_IDは旧「陸上部いいね管理」1hsmysg1b5uInd7mPE110hmzn0C2V5o87jRRatn-xhVQ。現行アプリに参照はなく、所有者がコピー不要と明示したため移管対象外。元共有・元データ・旧合体版GASは変更しない。

## OB記録の現在の出力先

元OBシート `188DwdYDpRuk4a27whOiu5lhhNK4MDaSeYRfXTHDhBAw` は共有ドライブ所属。個人オーナー譲渡ができないため、承認された部活所有シート `1b1KueR6oR0v_3UKpJUpzOrYKjPJW1-Q4Dg8digEaB8M` へ移行した。リンク全員・閲覧者、編集管理は部活。元は保持。切替前の13タブ・2793セル等の照合は一致。

アプリd4cfda5で切り替えた新IDは以降の稼働版とOB GAS v4でも維持し、シートIDに紐づく派生トークンも一致。GASウェブアプリURL・実行者・公開範囲・1時間トリガーは維持。296件のdryRunは差分0、署名付き通知も成功。10月練習シートは別の連携であり変更していない。

固定d4cfda5パックはDrive全量読戻し・復号・資材照合と113表/70画像の隔離復元を検証済み。本人4ロールと部活Gmailのアプリ未登録も復元先で確認した。旧92e8b09パックは履歴用で、復旧時は最新の検証済みsnapshot、対応するGit/成果物、日次運用設定を照合する。
