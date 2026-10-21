# OB共有スプレッドシートへの出力

アプリからOB共有スプシへ一方向で出力する。部活アカウントの独立GASを使い、共有スプシからアプリへの編集取込みは行わない。既存のGAS合体版・PC Jobsは維持する。

## 更新

- アプリの保存成功後、Nextのafterで署名付きの通知を送り、GASが専用APIから最新結果を取得する。通知本文はaction・timestamp・signatureだけで、参加者データを含めない。
- 署名は専用の読取り派生鍵を使うHMAC-SHA256。署名対象はob-publish:にミリ秒timestampを連結した文字列。2分を超える通知と不正署名は取得・書込み前に拒否する。通知URLは認証情報ではない。
- 定期取得は1時間ごとの1本。通知失敗時もDB保存を取り消さず、次の定期取得で追いつく。結果不明のDB保存は再送せず、確認後に通知する。
- 同じ版では書込み0。並行通知はScriptLockで直列化し、busy応答だけ送信側で最大3回まで試す。セルと版metadataを同じatomic batchで保存し、応答喪失後も列/行挿入を繰り返さない。

## 設置と保持

1. 既存の共有スプシの生成範囲を私有退避・確認する。共有Sheetに紐付けず、所有者限定GASへCode.js/appsscript.jsonを保存する。Sheets v4を有効にする。
2. Script PropertiesのOB_RESULTS_READ_TOKENはsrc/lib/ob-results-feed-auth.tsのobResultsFeedTokenで生成する。元のSHEET_SYNC_SECRETと派生鍵をログ/Git/共有Sheetへ出さない。
3. OB_RESULTS_INITIAL_RANGESに確認済み12タブの生成範囲だけを保存する。範囲なし・取得失敗・対象違い・タブ改名/消失・名簿0件化では前回内容を保持する。
4. dryRunObResultsPublishで変更範囲を確認後、publishObResultsで反映する。installObResultsTriggerは旧5分timerを1時間timerへ置換し、旧編集triggerを撤去する。繰り返してもtimerは1本。
5. 保存通知用Webアプリは部活アカウント `tuattf.sys@gmail.com` として実行し、全員から通信できる入口に署名認証をかける。この公開範囲は所有者の明示承認が必要。コード/Sheet共有範囲は変更しない。通知URLはsrc/lib/ob-results-notify.tsへ設定する。

## シート所有者の引き継ぎ

対象は部活所有の `1b1KueR6oR0v_3UKpJUpzOrYKjPJW1-Q4Dg8digEaB8M`。元の大学共有ドライブから13タブをコピーし、値・式・書式・生成範囲metadataを読み取り照合する。コピーだけで連携先は変わらない。

`OB_RESULTS_TARGET` とアプリの `OB_RESULTS_SPREADSHEET_ID` は必ず同じIDにする。読み取り鍵と旧状態編集鍵もIDから派生するため、対象変更では部活GASの `OB_RESULTS_READ_TOKEN` を対応する派生鍵へ置換する。旧シート向けの鍵を新しいAPIで受け付けない。元の同期秘密をGASやシートへ追加しない。

切替時は現行GASの定期実行を止め、アプリの対象ID、GASの対象ID/派生鍵/公開versionを揃えてdryRunと署名付き通知を検証してから1本の定期実行を再開する。コピー済みmetadataとbaselineを保持し、初期範囲を推測して上書きしない。旧シートは内容を保持した更新停止資料とし、新旧へ同時出力しない。作業中の失敗は同じ版のアプリ・GAS・派生鍵へ戻す。実反映状態は `docs/PORTABLE-HANDOFF-PLAN-2026-10-20.md` の終了記録で確認する。

独自タブ・右/下の追記・過去の記録は保持する。旧エントリー編集タブは管理印と私有baselineが一致した場合だけ生成結果と同じbatchで撤去する。公開出場状況はDNS/DNF/DQを表示し、取消はDNS扱い。順位は男女・種目別に自動計算し、DNS等は順位対象外。停止はこのGASのstopObResultsTriggerのみを使用する。

仕様: [Webアプリ](https://developers.google.com/apps-script/guides/web)、[Sheets batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate)。

## 6レーンリレーへの対応

リレー対応GASは `X-OB-Relay-Results: 1` を送り、従来12タブに6レーンのチーム名・タイム・順位・1走〜4走を加えた13タブを取得する。ヘッダーのない既存GASは12タブを維持する。対応版の初回だけ、生成範囲metadataが12タブで同名タブが存在しない場合にリレータブを同じatomic batchで追加する。既存の同名タブは勝手に管理対象にしない。

配信元の所有アカウント・プロジェクト・既存deploymentとソースを確認し、シートsnapshotとdryRun後に、そのdeploymentだけを対応版へ更新する。別アカウントに残る旧プロジェクトを更新しても現行配信が更新された証拠にはしない。
