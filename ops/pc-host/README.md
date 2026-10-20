# PCアプリの単一host

Cloudflare固定入口 → named Tunnel → loopback gateway → Next一つ → PC内DB/Auth/画像。
PC主系への切替後の状態と未確認は [PC本番運用](../laptop/PC-PRODUCTION-HANDOFF.md) の最新注記を優先する。以下はhostの構成・検証契約であり、ソースが存在することだけで配置済みとは扱わない。独立releaseには
`environment.local.example.env` と [PCローカル構成の準備](../local-minimal/PC-PRECUTOVER.md) を使う。
旧release/envと未解決履歴は復旧資料として保持する。旧cloud Data API・relay・Windows backend/Jobsの停止とsource fenceを維持し、旧Auth/画像設定や業務mirrorへ自動で戻さない。
業務の予備/再送/lease発見は使わず、PC外には暗号化バックアップを残す。

公開入口と個別操作の権限は別の境界。gatewayはbody/期限/Origin/内部headerを制限するが、本人確認とRLSはアプリとDBで必須。
入口は127.0.0.1のみで起動し、固定Tunnelはgatewayだけへ接続する。Next・DB管理口をLANへ公開しない。

本人IDと許可リストの連携を維持し、旧業務予備の未解決書込みは照合記録を保持する。
Jobsは同じNextへ接続するshared-pcモードを使用し、既存journalの履歴を保持する。
今後originや配置を変える場合も、Googleログイン、Push購読、PWA/旧タブへの影響を対象ごとに確認する。

保存を許可しない公開検証では、root所有host設定の`gatewayReadOnly: true`を使う。
通常の保存・削除・cron入口を拒否し、同じOriginのGoogle PKCE交換・更新・logoutだけを通す。
この設定は公開入口だけに適用し、定期処理は従来どおりprivate app portへ接続する。

## 準備と起動

Linuxで管理主体をrootとして起動する場合は、`applicationUid`、`applicationGid`
（ともに非特権のnumeric ID）と`setprivSha256`を具体的に設定する。buildとNextは
固定`/usr/bin/setpriv`で別UID/GIDへ落とし、補助group/capabilityを除去し、
no-new-privilegesを設定する。rootのままNextを起動する設定は拒否する。
アプリのUIDにはrelease/Nodeの読取りとNextの可変cacheだけを与え、backupと
Auth/connectorの秘密directoryへアクセスさせない。管理主体のrootは信頼対象である。
numeric IDの指定自体はOS account作成・サービス登録を行わない。
`applicationHome`はそのUID所有のprivate directoryへ固定する。build/NextのHOMEは
このdirectoryだけに設定し、管理主体のhomeや資格情報を引き継がない。
WSLのWindows共有領域はUIDだけでは秘密を隔離できないため、Linuxの管理主体は
private mount namespaceを作り、`/mnt`と存在する旧PC backend directoryを隠してから
権限を落とす。`unshareSha256`、`mountSha256`、root所有の`sandboxScript`の絶対pathと
`sandboxScriptSha256`を固定する。scriptは`linux-application-sandbox.sh`の検証済みcopyを
rootのprivate directoryへ配置する。Node/release/画像/homeは隠す領域の外へ置く。
隔離は子processのmount namespaceに限定し、既存本番のmountを保持する。

Node24と、WindowsではPowerShell7を使用する。独立したrelease checkoutに `npm ci` で依存を用意する。開発checkoutのnode_modules・.envを共用しない。releaseは正確なcommitへ固定し、未コミット/未追跡ファイルがある場合はbuildを拒否する。

`config.example.json` と `environment.example.env` は置換前の例であり、起動設定ではない。実env・stateはGit外の専用directoryへ置く。Windowsでは新規directoryのACLを本人/SYSTEMだけにしてから書き、既存directoryの明示的な他者権限やjunctionを拒否する。これは現在の実行者との境界であり、開発/AIから本番秘密を隔離する専用OSアカウントの配置確認は別途必要。

1. `enabled:false` で `node ops/pc-host/build.mjs <private-config.json>` を実行する。Next出力は保護済みstate内だけへ保存する。固定commit・lockfile・Node・env・buildと、実行依存/publicのmanifestをreceiptへ束ねる。旧receiptは再buildが必要。
2. `node ops/pc-host/run.mjs <private-config.json>` でreceiptの一致を確認する。`--execute` と `enabled:true` が揃うまではlistenerを起動しない。
3. Windowsでは、選択したPowerShell7を専用accountで起動し、`account-preflight.ps1 -RuntimeAccount <専用account> -DevelopmentAccount <開発account> -NodePath <絶対path> -ConfigPath <絶対path> -PowerShellPath <現在のPowerShell7絶対path>` で配置を検査する。この検査はaccount・ACL・taskを変更しない。同じaccount、管理者所属、開発側から変更できるrelease/依存/実行ファイル、第三者が読めるenv/stateを拒否する。
4. 検査に合格した同じaccountで `stage-task.ps1` に同じ引数（RuntimeAccountはAccount）と `-OutputPath <保護済みstate内の新XML>` を指定する。無効なS4U Task XMLを作るだけで、登録/起動や既存taskの削除は行わない。Taskも毎回同じ検査を行う。S4U実行とOS再起動は別の受入試験。
5. `backupConfigFile` と、既存PCの正確なarchive instance UUID・DB system identifierを固定する。hostは単一の[backup supervisor](../pc-backup/README.md)を先に所有し、毎起動のgeneration/startedAt/status path/DB IDをserverだけのchild envへ渡す。PC内構成では`localSnapshotReceiptFile`によるDB/Auth/画像のcombined snapshotを同じ世代で照合する。初回の新しい暗号archiveと復元検証が揃うまでは保存を保護し、Auth/読み取りは起動できる。静的envの旧generationは受け付けない。
6. 起動はNext/gatewayとも127.0.0.1限定。gateway公開前に `/api/version` のcommitとreleaseIdを照合する。Task wrapperのmutexとstate lockで競合を拒否する。以前の候補で検証したlock primitiveを再利用し、managed wrapperがOS mutexを持ち、元PIDの停止とファイル同一性を再確認できる場合だけ古いlockを回収する。直接起動・生存/再利用PID・権限不明・壊れたlockは拒否する。backup側の不明lockは自動回収しない。

更新前に最新の[PC本番運用](../laptop/PC-PRODUCTION-HANDOFF.md)を確認し、正式監視と独立した保全監視を先に維持する。正式監視はappの短い停止でも終了し、WSLサービスとmountが失われる場合がある。その上で共有Jobsの新規dispatchを止めてjournalの未解決操作を確認し、host設定を無効にする。hostはbackupを保護状態にして新規保存を止め、gateway経由の進行中要求と所有するNextをdrainする。backupの停止結果も確認し、未終了の可能性が残るbackup lockを成功扱いしない。Nextの標準終了処理をIPC経由で呼び、親死亡時も子だけを終了する。結果不明の書込みを再送しない。旧release/env/receiptを保全したまま、新releaseは別directoryとreleaseIdでbuildする。同じstate内で実行者は一つ。DB変更のrollbackはhostの旧版起動と別に評価する。

receiptは実行時node_modules（`.cache`のみ除外）・public・Node実行ファイルのSHA256とOS/architectureを含む。専用 `npm ci` からbuildし、改変や別platformを起動前に拒否する。Windowsでbuildした依存をLinuxへコピーして使わず、Linux上で改めて `npm ci` / build / receiptを作る。`.next/cache`等の可変診断/cacheはbuild hashから除外する。

Windowsの配置は、releaseとNode/PowerShell実行directoryをSYSTEM/Administrators等の管理主体が所有・変更し、専用accountへ読取り/実行だけを与える。`.next/cache`・trace・trace-build・diagnosticsだけを専用accountの可変領域として扱う。env/config/stateは専用accountとSYSTEMだけの保護ACLに置き、上位directoryからの置換権限も検査する。Gitの所有者確認は検査済みの正確なrelease directoryに限ったコマンド内設定を使用する。管理者権限の保有者による変更は可能であり、この配置で管理者まで排除できるとは扱わない。

## 合成試験と残条件

`synthetic-review.mjs --check` は外部接続やlistener/key生成を行わない。既存のowner-named private stateを指定した `--serve --state-dir <path>` だけが、独立のfake PC API18180/cloud Auth18181を起動する。実サービスの資格情報を引き継がず、画像/Sheetsを無効にする。これはbuilt NextのHTTP/cookie/経路/障害の試験用で、実DBのRLS・Google・Drive・R2・Push・PWAの証拠ではない。

実構成の確認済み範囲と未確認は[PC本番運用](../laptop/PC-PRODUCTION-HANDOFF.md)と[集約作業記録](../../docs/PC-LOCAL-AUTH-IMAGES-2026-10-12.md)の終了追記を参照する。今後の変更でも固定入口/hostname、OAuth callback、local画像、Push鍵/購読、秘密隔離、通常保存、旧タブ、実端末PWA、OS再起動と別媒体復元を影響に応じて確認する。合成試験を実機の証拠にしない。

## 現行backupと旧backendの境界

旧 `ops/laptop/run-backend.mjs` は中継・接続先通知・業務mirrorとbackupをまとめた旧構成として保持する。現在は旧backendを無効にし、PC内の `ops/local-minimal/backup.py` と `periodic.py` による15分combined backup、およびhost側の検証済みreceipt照合へ分離している。旧backendを復活させて二重のbackup/writerを作らない。

今後の移設でも、DB/WSLの起動、15分backupと別場所の検証済み保存、backup失敗時の保護停止を維持する主体と配置を確認する。archiveの読戻し・別DB復元、単一実行・失敗・復帰を保ち、Jobsのready判定も同じ主体へ接続する。旧heartbeatを架空の成功状態で更新したり、backup期限を外して通さない。専用accountのapp配置検査だけでWSL/DBや復旧鍵を隔離済みとは扱わない。

PC専用REST/Server Action/service-roleの変更、画像保存、GAS/Sheetsへの変更は、hostが所有する同じgenerationとDB IDの状態で保護する。POSTの読み取りRPCは既知の関数・引数・public schemaに限って区別する。backup未完了/35分超過・心拍/target120秒以上・未来時刻・別generation/DB・状態取得不明は503で保存を止める。認証はPC内の既存経路を使い、cloud Authへ迂回しない。JobsもhostのSHA/releaseId/心拍と同じbackupを照合する。直接運用SQL・認証管理・DB cronはこのapp transportの外側なので個別の運用保護が必要であり、アプリの試験だけで継承済みとはしない。

Jobsは現在動いているtaskが指定するconfigの `stateDirectory` と `activateAt` を読み、journalの同じ境界・未解決status・Sheets failure履歴を保持する。例の新stateや2099年の境界で置換しない。現在のreleaseと候補の識別も別に確認する。

旧業務予備の `failover_changes` は、件数のHEAD取得だけでは内容照合を証明できない。退役時のsnapshot/dry-runと確定状態の記録を保持し、結果不明の操作を一括再送したり、queue/mirror-stateを消して解消扱いしない。過去の切替手順を根拠に旧mirror・writerを再開しない。
