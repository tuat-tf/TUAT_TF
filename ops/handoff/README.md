# 現行PC構成の引き継ぎ入口

2026-10-22更新。公開入口は https://app.tuat-tf.workers.dev 。GitHubは `tuat-tf/TUAT_TF`、Cloudflareの公開入口とTunnel、Google Cloud/GASの運用主体、暗号化バックアップの保存先を部活側へ切り替えた。旧サービスの撤去と全権限の整理は継続中。

PC稼働アプリは `92e8b09`、GASの複数組対応を含むソースは `d122469`。古い移設文書のSupabaseクラウド認証・R2保存・Vercel本体という前提で復元しない。秘密値はこのフォルダやGitへ置かない。

部活Googleでログインしたアプリ利用者にも、既存のシステム・管理者・OB戦運営ロールを付与し、管理画面を実確認した。個人プロフィールの学年・所属は未設定でよい。初回の個人記録設定を「戻る」で閉じ、`/admin` を使う。旧管理者ロールの最終撤去は別工程。

## 復旧に必要なもの

1. 部活Google Driveの非公開「TUAT TF 暗号化バックアップ」フォルダ。15分定期のDB・画像・Jobs snapshotと、別途採取した復旧支援パックを使う。
2. Driveと別保管の32byte復号鍵。既存のiPhone保管記録を引き継ぐ。鍵を再生成すると既存バックアップを開けない。
3. [設定・復旧資材一覧](SETTINGS.md)と、各パックに含まれるmanifest・取得/読戻し証跡。
4. Linux x86_64の復元先。現行はUbuntu/WSL2。任意のクラウド・OSでの復元完了はまだ未証明。

復旧支援パックは `core`（現行設定、資格情報、起動資材、固定snapshot、ソースbundle）、`release`（ビルド済みアプリと依存）、`node`、`image-db`、`image-auth`、`image-rest` の6部。既存TUATPC01 AES-256-GCM形式で暗号化する。復号鍵、Windowsの機械固有DPAPI blob、生の稼働DB、旧個人サービスの設定は含めない。Drive保存・全量読戻し・復号・ファイル照合の結果と、別PCでの全サービス復旧は別の確認項目。

## 不足の診断

`inventory.example.json` をGit外の非公開場所へコピーし、実際の資材の絶対パスを指定する。秘密値をJSONへ貼らない。未確認はnullのままにする。sourceId・releaseSha・snapshotの許容経過時間を実際の対象に合わせる。

```text
node ops/handoff/check.mjs --inventory <非公開inventory.jsonの絶対パス>
```

Node24.19を使用する。WindowsからLinuxのパスへ自動接続しないため、Linux資材はLinux上で検査する。診断器はネット接続・復号・起動・設定変更を行わない。出力は項目名と状態だけで、秘密値・保存先は表示しない。

終了コード0は一覧上の資材と手動確認記録がそろった状態、1は不足/不一致/未確認、2は入力不正。`inventoryComplete` は内容の正しさを保証せず、`restoreVerified` と `cutoverReady` は常にfalse。

| 状態 | 意味 |
| --- | --- |
| missing / missing-or-invalid | 未指定または形式不正 |
| missing-unreadable-or-unsafe | 読取り不可、空、リンク、通常ファイル以外 |
| present-content-unverified | ファイル存在だけ確認。内容・ACL・鍵は別検証 |
| matched | 指定した形式・対応関係が一致 |
| mismatched / invalid-or-mismatched | archive hash・source・時刻等が不一致 |
| stale | 指定した許容時間を超過 |
| manual-review-needed | 所有権・鍵の独立保管・外部結果等の確認が未完 |
| operator-record-present-unverified | 確認記録の存在だけ確認 |

形式2は `backupStorage: google-drive` または `r2` と `backupStorageAdministration` を使う。旧形式1の `r2Administration` も読めるが、Drive用確認として流用しない。実producerのUTCマイクロ秒時刻を原文のまま受け付ける。receipt・inventoryは64KiB、snapshot hash照合は256MiBまで。秘密設定の内容は読まない。

## 復元の順序

1. 部活Driveから必要な6部、最新の検証済みsnapshot、その取得証跡をダウンロードする。元PCを使えなくても取得できる経路を使う。
2. 独立保管鍵を非公開領域へ用意し、Node24と `ops/local-minimal/backup-codec.mjs` で各部を復号する。出力先は本人だけが読めるディレクトリとし、既存ファイルへ上書きしない。
3. `python3 -I -B ops/handoff/verify-support.py <復号した部品.tar.gz>` でmanifestと全ファイルhash・サイズ・所有者・権限・リンク境界を検査する。固定イメージ部品ではOCI blobとイメージの固定digestも照合する。読み取りのみで展開・起動はしない。取得SHAの一致だけで復元完了にしない。
4. 新ホストの暗号化領域・専用daemon・UID/GID・Node・固定イメージを構築する。旧LUKS UUIDやWindows DPAPIをそのまま使わず、新ホストで設定とsealを作る。
5. ネットワークを隔離した一時DBで既存 `backup.py` の復元検証を行い、全表・Auth UUID・RLS・画像・Jobs履歴を照合する。旧ロックを生きた処理として復活させず、結果不明の送信を再実行しない。
6. `core/source-inputs.json` に従いサービス設定を復元する。offsite.envから除外した `PC_BACKUP_ENCRYPTION_KEY` だけを独立鍵から再構成し、元SHAと照合する。認証・署名鍵は勝手に再生成しない。
7. 別origin/別セッション/別DBでログイン・閲覧・保存・画像・連携を確認する。実Sheets/Pushの外部送信は隔離試験中に有効化しない。
8. 旧writerを止め、最終snapshotと差分・Jobs結果不明・復旧先を確認してから本番を一つへ切り替える。新世代バックアップと公開URLを確認後、旧側を撤去する。

この文書は未検証の復元先で本番を起動する自動スクリプトではない。DB復元検証と復旧支援パックの照合だけで、別PCへの完全復旧を証明したとは扱わない。

## 既存の仕組み

- `ops/local-minimal/backup.py` / `BACKUP.md`: 一貫したDB・画像・Jobsの採取と隔離復元検証。
- `ops/local-minimal/backup-codec.mjs`: 既存暗号形式。復号はGCM検証後のみ出力を確定。
- `ops/local-minimal/drive-storage.mjs` / `offsite.mjs`: 部活Driveへの保存・全量読戻し・世代保持。
- `ops/local-minimal/runtime.py` / `pc/bootstrap.py`: 起動時の配置・秘密・サービス・世代の保護。
- [本人操作の一括一覧](OWNER-INPUT.md): 完了済み認可の再依頼をせず、残る本人確認だけをまとめる。
