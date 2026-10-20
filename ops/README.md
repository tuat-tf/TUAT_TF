# PC運用コードと検証の入口

主系はPC内のアプリ・DB・Auth・画像。稼働状態と未確認は
[本番引継ぎ](laptop/PC-PRODUCTION-HANDOFF.md)の最新追記を優先する。
この一覧や試験の成功を、本番の再起動・復元・実機操作の証拠にはしない。

| 範囲 | 現在の入口 |
| --- | --- |
| アプリ・gateway・共有Next | [pc-host](pc-host/README.md) |
| 定期処理・既存journal | [pc-jobs](pc-jobs/README.md) |
| PC起動・単一backup owner・combined snapshot | `local-minimal/pc/bootstrap.py`、`local-minimal/backup.py`、`local-minimal/periodic.py` |
| backup状態・復元/暗号化保存の照合 | [pc-backup](pc-backup/README.md)、`local-minimal/offsite.mjs` |
| Cloudflare入口 | [pc-host/cloudflare](pc-host/cloudflare/README.md) |

## 合成試験

Nodeは24を使う。`npm test`はアプリのVitestだけを実行するため、運用コードの変更では次も実行する。

- `npm run test:ops`: Windowsでも実行できるNode群。これだけでは運用検証全体の完了にはならない。
- `npm run test:ops:integration`: LinuxとNode 24が必須。現在のbackup/host/Jobs/入口と旧互換契約を含む。owner・mode・symlinkを確認する`backup-codec`/`import-images`の検査はWindowsでは成立しないため、入口で非0終了する。Linux用依存とPOSIX権限を扱える一時領域を使い、共有Windows用node_modulesを書き換えない。
- `npm run test:ops:windows`: WindowsとNode 24が必須。旧Windows wrapper mutex/launchを検証する`backup-lifecycle.test.mjs`と`runner-lock.test.mjs`を実行する。この2本だけをLinux integrationから固定リストで除外する。さらに`account-preflight.test.mjs`と`release.test.mjs`を両OSで実行し、WindowsのACL・Git CRLF・固定tool確認とLinuxのnpm link確認を補完する。Linuxの実FLOCK・非特権起動は下記Python群で確認する。両OSの確認を必要とし、除外やOS別skipを検証成功として数えない。
- `npm run test:ops:node`: 上記2群を順に実行するLinux用入口。Windowsで前半が成功しても全体成功にはならない。
- `npm run test:cloudflare`: Cloudflare入口のNode試験。
- `npm run test:ops:linux`: Linux/rootとPATH上のNode 24が必須。7本のPython試験を個別processで実行し、FLOCK・所有者・private namespaceを合成fixtureで確認する。前提不足やskipは非0終了とし、成功に含めない。
- `npm run test:ops:db:cloud-fence -- --image sha256:<cached-image-id> --socket <isolated-docker-socket>` と `test:ops:db:final-fence`: 旧移行fenceの復旧用DB合成試験。明示する既存imageと分離Dockerが必要なので通常のNode/Linux試験とは別に実行する。未実行は未確認として記録する。

Linux試験は本番と分離した使い捨て環境で行う。既存WSLのサービス/mountやDBを変更して試験環境を用意しない。Node試験内のOS別skipも報告し、Linux専用試験をWindowsの成功で代替しない。

## 旧構成と保管物

`laptop`には現在の引継ぎと旧backend/mirrorの実装が同居する。旧コードの存在を稼働中という意味に取らず、旧writer・cron・queueの停止を維持する。`pc-retirement`から旧mirrorの表定義を参照する部分などがあるため、directory全体を削除しない。

Jobsの旧専用Next準備は[legacy](pc-jobs/legacy/prepare-dedicated.mjs)に保管する。既定の`prepare-production.mjs`は旧設定を読まず停止する。現行配置ではhostの固定release/envと既存Jobsの`stateDirectory`・`activateAt`を引き継ぎ、`run.mjs --check`を使う。旧準備処理は現在のPC内構成の再配置には使わない。

旧ガラス生成物とライセンスは[glass/vendor](glass/README.md)に保管する。現在の直接透過UIとは別で、公開assetsには含めない。

## Backup整理の読戻し

15分ごとのbackupは暗号化転送後の全量読戻し・復元検証を維持する。
その直後の自動整理は、単一writer・現在のgeneration・完全なinventory・独立復旧鍵を確認し、
local/remote/metadataの削除候補がすべて0なら`inspected`で終了する。
この状態は追加のarchive検証成功を意味せず、削除を承認するdry-runとしても使えない。
削除候補がある場合と明示的なdry-runは、従来どおり保持archiveと削除対象の全量検証を行う。
取得失敗・未解決intent・owner変更は0件に変換せず`held`にする。
配置全体のhash検査は改ざん検出のため継続し、mtimeだけのcacheには置き換えない。
