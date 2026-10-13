# 本人用検証版の固定URL入口

`tuat-review.<account>.workers.dev`を、合成DB/Authだけの本人用gatewayへ中継する。
一時Tunnelの自動生成名を利用者に案内しないための検証専用入口。本番/PC集約のWorker・Tunnel・VPCは変更しない。

公開originとupstreamのtrycloudflare originを明示設定し、任意の転送先を受け付けない。
gatewayの1ブラウザ認証を維持し、内部検証ヘッダーを外部から渡さない。更新Originをdispatch前に確認し、通信失敗時に再送しない。

gatewayのdevice.jsonには固定publicOriginと、正確なtunnelOriginを設定する。
旧device記録は保全し、URL移行時だけ本人の接続枠を移す。
資格情報やownerコードはWorkerへ保存しない。設定ファイルは`.contingency/review/`内に保持する。
