# 本番反映のスクリプト化（2026-10-23）

## 目的
これまでの本番反映（PC release切替）は、毎回その場で書いた使い捨てスクリプトで行い、数行の修正でも数時間かかっていた。手順を `ops/pc-host/pc-release.py` にまとめ、同じ安全確認を短時間で繰り返せるようにした。

## 使い方（WSL内でroot）
```
python3 -I -B /mnt/d/TUAT_TF/<checkout>/ops/pc-host/pc-release.py release <40桁commit>   # build + prepare + switch
python3 -I -B .../pc-release.py switch <commit>            # 計画だけ表示（変更なし）
python3 -I -B .../pc-release.py prune --keep 2 [--execute] # 稼働中+直近2世代以外のrelease世代を削除
python3 -I -B .../pc-release.py replay-check <old> <new>   # 生成器が過去の設定一式を再現できるか確認
```
- build: `/mnt/d/TUAT_TF` からclone、PCにnpmがないため`package-lock.json`が同一のときだけ稼働中releaseの`node_modules`を再利用、ネットワーク遮断で`build.mjs`、root所有へ固定。lockfileが変わった版は拒否する（別途Linuxのnpmが必要）。
- prepare: 稼働中のinstallationを複製し、release固有の値（パス・commit・releaseId・2つの環境変数）だけ置換、release manifestとbackup封印を再計算。鍵は同一バイトで引き継ぎ、表示しない。build receiptをhost stateへ置く。
- switch: timer停止→Jobs停止（実行中ジョブがあれば中止）→app停止→3unit+runtime.json差替→起動→`/api/version`一致→Jobs・timer再開→backup封印を本番の検査関数で確認。起動しなければ自動で元のunit/runtimeへ戻す。
- 生成器は 10/22 の `dd0c1f1→7ae3079` 切替の設定一式22ファイルをバイト単位で再現できることを確認済み。

## 守ること
- 封印済みrelease内で `git status` 等のgitコマンドやPythonのimport（`__pycache__`生成）をしない。`.git/index`やファイル追加でmanifest照合が崩れ、次回起動を拒否する。
- Cloudflareの静的資材は、未登録ならWorker経由でPCから配信される（`not_found_handling: none`）。新しいchunkの反映に必須ではないが、静的配信の最適化は別途。

## 10/23の反映（eeb58ad）と障害
- 2026-10-23 20:34:48〜20:49:37 JST の約15分、アプリが停止した。原因はすべて本スクリプト初版の不備: (1) releaseのファイルモードを一律640にし、`pg_hba.conf`等の0644固定に違反、(2) build receiptをhost stateへ置いていなかった、(3) 途中で失敗したbackupの`failed`状態が起動条件に反した。自動巻戻し先の`7ae3079`も、同日の調査で実行した`git status`による`.git/index`変化で起動を拒否した。
- 手動で3点を修正して`eeb58ad`を起動。Jobs・timer active、backup封印valid、直後の手動backup成功（113表・画像72件検証）。3点はスクリプトへ反映済み（前releaseのモード継承、receipt配置、backup failedの記録と解除、起動失敗の即時検知）。
- 旧release 16世代（約18.9GB）をpruneし、使用量は38GB→20GB。稼働中`eeb58ad`と`7ae3079`・`dd0c1f1`、稼働設定が参照する`installation-92e8b09`（auth.env）・`build-home-da6ac6d`は保持。`7ae3079`は`.git/index`のずれで起動不可のため、実際の戻し先は`dd0c1f1`。
- 未対応: Windowsの起動タスクがCodexアプリ内のNode（`C:\Users\rainb\.cache\codex-runtimes\...`）に依存。Codex削除・更新で再起動時に本番が起動しなくなる恐れがある。
